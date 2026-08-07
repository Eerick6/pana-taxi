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

@Injectable()
export class PayphoneService {
  constructor(
    private config: ConfigService,
    @InjectRepository(Trip) private tripRepo: Repository<Trip>,
    private gateway: EventsGateway,
  ) {}

  private get token() { return this.config.get<string>('PAYPHONE_TOKEN', ''); }
  private get storeId() { return this.config.get<string>('PAYPHONE_STORE_ID', ''); }
  private get backendUrl() {
    return this.config.get<string>('BACKEND_URL', 'https://pana-taxi-production.up.railway.app');
  }

  async createLink(tripId: string, clientId: string): Promise<string> {
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

    const amountCents = Math.round(Number(trip.fare_amount) * 100);
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
    return url;
  }

  async confirmPayment(payphoneId: number, clientTxId: string, tripId: string, clientId: string): Promise<boolean> {
    const trip = await this.tripRepo.findOne({
      where: { id: tripId },
      relations: ['client'],
    });

    if (!trip) throw new NotFoundException('Viaje no encontrado');
    if (trip.client?.id !== clientId) throw new ForbiddenException('No autorizado');

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

    await this.tripRepo.update(tripId, {
      payment_status: approved ? PaymentStatus.COMPLETED : PaymentStatus.FAILED,
    });

    this.gateway.notifyTripUpdate(
      tripId,
      approved ? 'payment.completed' : 'payment.failed',
      { trip_id: tripId, success: approved },
    );

    return approved;
  }
}
