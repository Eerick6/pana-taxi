import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rating, RatingDirection } from './entities/rating.entity';
import { Driver, DriverType } from '../drivers/entities/driver.entity';
import { Client } from '../clients/entities/client.entity';
import { CreateRatingDto } from './dto/create-rating.dto';
import { UserRole } from '../users/entities/user.entity';

@Injectable()
export class RatingsService {
  constructor(
    @InjectRepository(Rating)
    private ratingsRepo: Repository<Rating>,
    @InjectRepository(Driver)
    private driversRepo: Repository<Driver>,
    @InjectRepository(Client)
    private clientsRepo: Repository<Client>,
  ) {}

  async create(userId: string, role: UserRole, dto: CreateRatingDto) {
    if (role === UserRole.CLIENT) {
      return this.rateAsClient(userId, dto);
    }
    if (role === UserRole.DRIVER) {
      return this.rateAsDriver(userId, dto);
    }
    throw new ForbiddenException('Solo clientes y conductores pueden calificar');
  }

  private async rateAsClient(userId: string, dto: CreateRatingDto) {
    if (dto.direction !== RatingDirection.CLIENT_TO_DRIVER) {
      throw new ForbiddenException('Los clientes solo pueden calificar al conductor');
    }
    if (!dto.trip_id) throw new BadRequestException('Se requiere trip_id');

    const already = await this.ratingsRepo.findOne({
      where: { trip_id: dto.trip_id, direction: RatingDirection.CLIENT_TO_DRIVER },
    });
    if (already) throw new ConflictException('Ya calificaste a este conductor en este viaje');

    const client = await this.clientsRepo.findOne({ where: { user: { id: userId } } });
    if (!client) throw new NotFoundException('Perfil de cliente no encontrado');

    const rating = await this.ratingsRepo.save(
      this.ratingsRepo.create({
        direction: dto.direction,
        trip_id: dto.trip_id,
        client,
        score: dto.score,
        comment: dto.comment,
      }),
    );

    return { message: 'Gracias por tu calificación', rating_id: rating.id };
  }

  private async rateAsDriver(userId: string, dto: CreateRatingDto) {
    const driver = await this.driversRepo.findOne({ where: { user: { id: userId } } });
    if (!driver) throw new NotFoundException('Perfil de conductor no encontrado');

    if (dto.direction === RatingDirection.DRIVER_TO_CLIENT) {
      // Driver rates client after a trip
      if (!dto.trip_id) throw new BadRequestException('Se requiere trip_id');

      const already = await this.ratingsRepo.findOne({
        where: { trip_id: dto.trip_id, direction: RatingDirection.DRIVER_TO_CLIENT },
      });
      if (already) throw new ConflictException('Ya calificaste al cliente en este viaje');

      const rating = await this.ratingsRepo.save(
        this.ratingsRepo.create({
          direction: dto.direction,
          trip_id: dto.trip_id,
          driver,
          score: dto.score,
          comment: dto.comment,
        }),
      );
      return { message: 'Calificación registrada', rating_id: rating.id };
    }

    if (dto.direction === RatingDirection.OWNER_TO_DRIVER) {
      // Owner rates the driver they hired via vehicle_request
      if (driver.driver_type !== DriverType.OWNER_DRIVER) {
        throw new ForbiddenException('Solo los conductores-dueños pueden calificar como owner');
      }
      if (!dto.vehicle_request_id) throw new BadRequestException('Se requiere vehicle_request_id');

      const already = await this.ratingsRepo.findOne({
        where: { vehicle_request_id: dto.vehicle_request_id, direction: RatingDirection.OWNER_TO_DRIVER },
      });
      if (already) throw new ConflictException('Ya calificaste al conductor de esta solicitud');

      const rating = await this.ratingsRepo.save(
        this.ratingsRepo.create({
          direction: dto.direction,
          vehicle_request_id: dto.vehicle_request_id,
          owner: driver,
          score: dto.score,
          comment: dto.comment,
        }),
      );
      return { message: 'Calificación registrada', rating_id: rating.id };
    }

    if (dto.direction === RatingDirection.DRIVER_TO_OWNER) {
      // Regular driver rates the owner after working on their vehicle
      if (driver.driver_type !== DriverType.DRIVER) {
        throw new ForbiddenException('Solo conductores regulares pueden calificar al dueño');
      }
      if (!dto.vehicle_request_id) throw new BadRequestException('Se requiere vehicle_request_id');

      const already = await this.ratingsRepo.findOne({
        where: { vehicle_request_id: dto.vehicle_request_id, direction: RatingDirection.DRIVER_TO_OWNER },
      });
      if (already) throw new ConflictException('Ya calificaste al dueño de esta solicitud');

      const rating = await this.ratingsRepo.save(
        this.ratingsRepo.create({
          direction: dto.direction,
          vehicle_request_id: dto.vehicle_request_id,
          driver,
          score: dto.score,
          comment: dto.comment,
        }),
      );
      return { message: 'Calificación registrada', rating_id: rating.id };
    }

    throw new ForbiddenException('Dirección de calificación no válida para conductores');
  }

  async getDriverStats(driverId: string) {
    const driver = await this.driversRepo.findOne({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Conductor no encontrado');

    // Rating from clients (trips)
    const clientAvg = await this.ratingsRepo
      .createQueryBuilder('r')
      .select('AVG(r.score)', 'average')
      .addSelect('COUNT(*)', 'total')
      .where('r.driver_id = :driverId', { driverId })
      .andWhere('r.direction = :dir', { dir: RatingDirection.CLIENT_TO_DRIVER })
      .getRawOne();

    // Rating from owners (vehicle requests)
    const ownerAvg = await this.ratingsRepo
      .createQueryBuilder('r')
      .select('AVG(r.score)', 'average')
      .addSelect('COUNT(*)', 'total')
      .where('r.driver_id = :driverId', { driverId })
      .andWhere('r.direction = :dir', { dir: RatingDirection.OWNER_TO_DRIVER })
      .getRawOne();

    const recentReviews = await this.ratingsRepo.find({
      where: { driver: { id: driverId }, direction: RatingDirection.CLIENT_TO_DRIVER },
      order: { created_at: 'DESC' },
      take: 10,
    });

    return {
      driver_id: driverId,
      from_clients: {
        average: parseFloat(clientAvg?.average ?? '0'),
        total: parseInt(clientAvg?.total ?? '0'),
      },
      from_owners: {
        average: parseFloat(ownerAvg?.average ?? '0'),
        total: parseInt(ownerAvg?.total ?? '0'),
      },
      recent_reviews: recentReviews,
    };
  }

  async getOwnerStats(ownerId: string) {
    const owner = await this.driversRepo.findOne({
      where: { id: ownerId, driver_type: DriverType.OWNER_DRIVER },
    });
    if (!owner) throw new NotFoundException('Dueño no encontrado');

    const avg = await this.ratingsRepo
      .createQueryBuilder('r')
      .select('AVG(r.score)', 'average')
      .addSelect('COUNT(*)', 'total')
      .where('r.owner_id = :ownerId', { ownerId })
      .andWhere('r.direction = :dir', { dir: RatingDirection.DRIVER_TO_OWNER })
      .getRawOne();

    const recentReviews = await this.ratingsRepo.find({
      where: { owner: { id: ownerId }, direction: RatingDirection.DRIVER_TO_OWNER },
      order: { created_at: 'DESC' },
      take: 10,
    });

    return {
      owner_id: ownerId,
      average: parseFloat(avg?.average ?? '0'),
      total: parseInt(avg?.total ?? '0'),
      recent_reviews: recentReviews,
    };
  }

  async getClientStats(clientId: string) {
    const client = await this.clientsRepo.findOne({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Cliente no encontrado');

    const avg = await this.ratingsRepo
      .createQueryBuilder('r')
      .select('AVG(r.score)', 'average')
      .addSelect('COUNT(*)', 'total')
      .where('r.client_id = :clientId', { clientId })
      .andWhere('r.direction = :dir', { dir: RatingDirection.DRIVER_TO_CLIENT })
      .getRawOne();

    return {
      client_id: clientId,
      average: parseFloat(avg?.average ?? '0'),
      total: parseInt(avg?.total ?? '0'),
    };
  }
}
