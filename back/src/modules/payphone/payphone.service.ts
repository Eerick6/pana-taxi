import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Trip, PaymentStatus } from '../trips/entities/trip.entity';
import { EventsGateway } from '../gateway/events.gateway';
import { DriverWallet } from '../wallet/entities/driver-wallet.entity';
import { WalletService } from '../wallet/wallet.service';
import { Client } from '../clients/entities/client.entity';
import { encryptCardHolder } from './payphone-crypto.util';
import { computeCardAmounts } from './payphone-fee.util';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/app-notification.entity';

@Injectable()
export class PayphoneService {
  constructor(
    private config: ConfigService,
    @InjectRepository(Trip) private tripRepo: Repository<Trip>,
    @InjectRepository(DriverWallet) private walletRepo: Repository<DriverWallet>,
    @InjectRepository(Client) private clientRepo: Repository<Client>,
    private walletService: WalletService,
    private gateway: EventsGateway,
    private notificationsService: NotificationsService,
  ) {}

  private get token() { return this.config.get<string>('PAYPHONE_TOKEN', ''); }
  private get storeId() { return this.config.get<string>('PAYPHONE_STORE_ID', ''); }
  private get backendUrl() {
    return this.config.get<string>('BACKEND_URL', 'https://pana-taxi-production.up.railway.app');
  }

  async createLink(tripId: string, clientId: string) {
    const trip = await this.tripRepo.findOne({
      where: { id: tripId },
      relations: ['client'],
    });

    if (!trip) throw new NotFoundException('Viaje no encontrado');
    if (trip.client?.id !== clientId) throw new ForbiddenException('No autorizado');
    if (trip.payment_status === PaymentStatus.COMPLETED) {
      throw new BadRequestException('El pago ya fue completado');
    }
    if (!trip.fare_amount) throw new BadRequestException('El viaje aún no tiene tarifa final');

    const fare = Number(trip.fare_amount);
    const { chargedAmount, feeAmount } = await this._computeAndStoreCardAmounts(tripId, fare);
    const amountCents = Math.round(chargedAmount * 100);
    // clientTransactionId: max 15 chars
    const clientTxId = tripId.replace(/-/g, '').slice(0, 15);
    const responseUrl = `${this.backendUrl}/payphone/callback?trip_id=${tripId}`;

    const { data } = await axios.post(
      'https://pay.payphonetodoesposible.com/api/Links',
      {
        amount:                amountCents,
        amountWithoutTax:      amountCents,
        clientTransactionId:   clientTxId,
        currency:              'USD',
        reference:             'Pana Taxi',
        storeId:               this.storeId,
        responseUrl,
        cancellationUrl:       `${responseUrl}&cancelled=1`,
        oneTime:               true,
        lang:                  'es',
      },
      {
        headers: {
          Authorization:  `bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      },
    );

    // Payphone devuelve la URL directamente como string
    const url = typeof data === 'string' ? data : data?.url ?? data?.link ?? String(data);
    return {
      url,
      fare_amount: fare,
      card_fee_amount: feeAmount,
      card_charged_amount: chargedAmount,
    };
  }

  // Desglose tarifa/recargo/total para mostrarle al cliente ANTES de cobrar
  // — usado por el flujo de tarjeta guardada, que no pasa por el webview
  // donde createLink ya muestra el total en la pantalla de Payphone.
  async estimateCardCharge(tripId: string, clientId: string) {
    const trip = await this.tripRepo.findOne({ where: { id: tripId }, relations: ['client'] });
    if (!trip) throw new NotFoundException('Viaje no encontrado');
    if (trip.client?.id !== clientId) throw new ForbiddenException('No autorizado');
    if (!trip.fare_amount) throw new BadRequestException('El viaje aún no tiene tarifa final');

    const fare = Number(trip.fare_amount);
    const { chargedAmount, feeAmount } = await this._computeAndStoreCardAmounts(tripId, fare);
    return { fare_amount: fare, card_fee_amount: feeAmount, card_charged_amount: chargedAmount };
  }

  async confirmPayment(
    payphoneId: number,
    clientTxId: string,
    tripId: string,
    clientId: string,
    cardToken?: string,
  ): Promise<boolean> {
    const trip = await this.tripRepo.findOne({
      where: { id: tripId },
      relations: ['client', 'driver', 'driver.user'],
    });

    if (!trip) throw new NotFoundException('Viaje no encontrado');
    if (trip.client?.id !== clientId) throw new ForbiddenException('No autorizado');

    // Ya se confirmó antes (reintento/webhook duplicado) — no volver a
    // acreditarle al conductor.
    if (trip.payment_status === PaymentStatus.COMPLETED) return true;

    const { data } = await axios.post(
      'https://paymentbox.payphonetodoesposible.com/api/confirm',
      { id: payphoneId, clientTxId },
      {
        headers: {
          Authorization:  `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      },
    );

    // statusCode 3 = Approved
    const approved = data?.statusCode === 3;

    // Guardamos el ctoken de la respuesta aunque el pago actual falle — es
    // válido igual para cobros futuros (Payphone lo genera al procesar la
    // tarjeta, no al aprobar el monto puntual).
    if (cardToken && trip.client?.id) {
      await this.clientRepo.update(trip.client.id, { payphone_card_token: cardToken });
    }

    await this._settleCardPayment(trip, approved);
    return approved;
  }

  // Cobra usando una tarjeta ya tokenizada — sin pasar por el webview de
  // Payphone. Requiere que la cuenta tenga tokenización aprobada por
  // Payphone; si no, esta llamada va a fallar del lado de ellos aunque el
  // código esté bien (ver docs.payphone.app/tokenizacion).
  async chargeWithToken(tripId: string, clientId: string): Promise<boolean> {
    const trip = await this.tripRepo.findOne({
      where: { id: tripId },
      relations: ['client', 'client.user', 'driver', 'driver.user'],
    });

    if (!trip) throw new NotFoundException('Viaje no encontrado');
    if (trip.client?.id !== clientId) throw new ForbiddenException('No autorizado');
    if (trip.payment_status === PaymentStatus.COMPLETED) return true;
    if (!trip.fare_amount) throw new BadRequestException('El viaje aún no tiene tarifa final');

    const client = await this.clientRepo.findOne({ where: { id: clientId }, relations: ['user'] });
    if (!client?.payphone_card_token) {
      throw new BadRequestException('No hay una tarjeta guardada para esta cuenta');
    }

    const { chargedAmount } = await this._computeAndStoreCardAmounts(tripId, Number(trip.fare_amount));
    const amountCents = Math.round(chargedAmount * 100);
    const clientTxId = tripId.replace(/-/g, '').slice(0, 15);

    const { data } = await axios.post(
      'https://pay.payphonetodoesposible.com/api/transaction/web',
      {
        cardHolder:           encryptCardHolder(client.full_name),
        cardToken:            client.payphone_card_token,
        documentId:           client.cedula,
        phoneNumber:          client.user?.phone ?? '',
        email:                client.user?.email ?? '',
        amount:               amountCents,
        amountWithoutTax:     amountCents,
        clientTransactionId:  clientTxId,
        currency:             'USD',
        storeId:              this.storeId,
        order: {
          billTo: {
            name: client.full_name,
            email: client.user?.email ?? '',
          },
          lineItems: [
            { name: 'Viaje Pana Taxi', quantity: 1, unitPrice: amountCents, totalAmount: amountCents },
          ],
        },
      },
      {
        headers: {
          Authorization:  `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      },
    );

    // Mismo criterio de aprobación que /api/confirm — statusCode 3 = Approved
    const approved = data?.statusCode === 3;
    await this._settleCardPayment(trip, approved);
    return approved;
  }

  async hasCardToken(clientId: string): Promise<boolean> {
    const client = await this.clientRepo.findOne({ where: { id: clientId } });
    return !!client?.payphone_card_token;
  }

  private async _computeAndStoreCardAmounts(tripId: string, fare: number) {
    const { chargedAmount, feeAmount } = computeCardAmounts(fare);
    await this.tripRepo.update(tripId, {
      card_fee_amount: feeAmount as any,
      card_charged_amount: chargedAmount as any,
    });
    return { chargedAmount, feeAmount };
  }

  // Común a confirmPayment y chargeWithToken: marca el viaje, acredita al
  // conductor su parte neta si corresponde, y le avisa — el conductor tiene
  // que enterarse de que el pago se procesó sí o sí, no solo si tiene la
  // pantalla del viaje abierta en ese momento. Por eso van TRES canales:
  // 1) socket al room del viaje (quien lo tenga abierto, ve el cambio ya),
  // 2) socket directo a su room de usuario (aunque haya salido del viaje),
  // 3) push FCM (aunque tenga la app cerrada o el celular bloqueado).
  private async _settleCardPayment(trip: Trip, approved: boolean): Promise<void> {
    await this.tripRepo.update(trip.id, {
      payment_status: approved ? PaymentStatus.COMPLETED : PaymentStatus.FAILED,
    });

    let driverShare = 0;
    if (approved && trip.driver?.id) {
      const wallet = await this.walletRepo.findOne({ where: { driver: { id: trip.driver.id } } });
      const fare = Number(trip.fare_amount ?? 0);
      const commission = Number(trip.commission_amount ?? 0);
      driverShare = +(fare - commission).toFixed(2);
      if (wallet && driverShare > 0) {
        await this.walletService.creditCardEarning(wallet.id, driverShare, trip.id);
      }
    }

    this.gateway.notifyTripUpdate(
      trip.id,
      approved ? 'payment.completed' : 'payment.failed',
      { trip_id: trip.id, success: approved },
    );

    const driverUserId = trip.driver?.user?.id;
    if (driverUserId) {
      this.gateway.notifyUser(driverUserId, approved ? 'payment.completed' : 'payment.failed', {
        trip_id: trip.id,
        success: approved,
        driver_share: driverShare || undefined,
      });

      if (approved) {
        this.notificationsService.sendToUser(driverUserId, {
          type: NotificationType.WALLET,
          title: 'Pago con tarjeta recibido',
          body: driverShare > 0
            ? `El cliente pagó con tarjeta. Se acreditaron $${driverShare.toFixed(2)} a tu saldo por tarjeta.`
            : 'El cliente pagó con tarjeta y el pago fue confirmado.',
          data: { trip_id: trip.id, type: 'payment_completed' },
        }).catch(() => {});
      } else {
        this.notificationsService.sendToUser(driverUserId, {
          type: NotificationType.TRIP,
          title: 'Pago con tarjeta falló',
          body: 'El cobro con tarjeta no se pudo procesar. Coordina el pago directo con el pasajero.',
          data: { trip_id: trip.id, type: 'payment_failed' },
        }).catch(() => {});
      }
    }
  }
}
