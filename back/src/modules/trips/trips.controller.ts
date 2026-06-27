import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { TripsService } from './trips.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { CompleteTripDto } from './dto/complete-trip.dto';
import { CancelTripDto } from './dto/cancel-trip.dto';
import { MakeOfferDto } from './dto/make-offer.dto';
import { StartTripDto } from './dto/start-trip.dto';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';
import { TripStatus } from './entities/trip.entity';

const PLATFORM_ROLES = [UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.SUPPORT, UserRole.MONITORING];
const COOP_ROLES = [UserRole.COOPERATIVE_ADMIN, UserRole.COOPERATIVE_OPERATOR, UserRole.COOPERATIVE_SUPERVISOR];

@Controller('trips')
@UseGuards(JwtGuard, RolesGuard)
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  // ── Crear viaje (cliente o cooperativa) ──────────────────────────────────────

  @Post()
  @Roles(UserRole.CLIENT, UserRole.COOPERATIVE_ADMIN, UserRole.COOPERATIVE_OPERATOR)
  createTrip(@CurrentUser() user: User, @Body() dto: CreateTripDto) {
    return this.tripsService.createTrip(user, dto);
  }

  // ── Driver: endpoints propios ────────────────────────────────────────────────

  @Get('available')
  @Roles(UserRole.DRIVER)
  getAvailableTrips(@CurrentUser() user: User) {
    return this.tripsService.getAvailableTrips(user.id);
  }

  // Acepta el viaje: METER → asignación directa; NEGOTIATED → crea oferta al precio del cliente
  @Patch(':id/accept')
  @Roles(UserRole.DRIVER)
  acceptTrip(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.tripsService.acceptTrip(id, user.id);
  }

  // Conductor hace oferta de precio personalizado (solo NEGOTIATED)
  @Post(':id/offers')
  @Roles(UserRole.DRIVER)
  makeOffer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: MakeOfferDto,
  ) {
    return this.tripsService.makeOffer(id, user.id, dto);
  }

  // Conductor marca que llegó al punto de recogida — inicia contador de espera 5 min
  @Patch(':id/arrived')
  @Roles(UserRole.DRIVER)
  driverArrived(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.tripsService.driverArrived(id, user.id);
  }

  // Iniciar viaje (requiere OTP del pasajero; en dev '000000' lo bypasa)
  @Patch(':id/start')
  @Roles(UserRole.DRIVER)
  startTrip(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: StartTripDto,
  ) {
    return this.tripsService.startTrip(id, user.id, dto);
  }

  @Patch(':id/complete')
  @Roles(UserRole.DRIVER)
  completeTrip(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: CompleteTripDto,
  ) {
    return this.tripsService.completeTrip(id, user.id, dto);
  }

  @Get('driver/me')
  @Roles(UserRole.DRIVER)
  getMyTripsAsDriver(
    @CurrentUser() user: User,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.tripsService.getMyTripsAsDriver(user.id, page, limit);
  }

  @Get('driver/me/active')
  @Roles(UserRole.DRIVER)
  getActiveTripAsDriver(@CurrentUser() user: User) {
    return this.tripsService.getActiveTripAsDriver(user.id);
  }

  // ── Cliente: endpoints propios ───────────────────────────────────────────────

  // Lista todas las ofertas de conductores para un viaje negociado del cliente
  @Get(':id/offers')
  @Roles(UserRole.CLIENT)
  getOffers(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.tripsService.getOffers(id, user.id);
  }

  // Cliente selecciona una oferta → asigna conductor, rechaza el resto
  @Patch(':id/offers/:offerId/select')
  @Roles(UserRole.CLIENT)
  selectOffer(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @CurrentUser() user: User,
  ) {
    return this.tripsService.selectOffer(id, offerId, user.id);
  }

  // Cliente incrementa su oferta $0.25 si no hay conductores interesados
  @Patch(':id/increment-offer')
  @Roles(UserRole.CLIENT)
  incrementOffer(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.tripsService.incrementOffer(id, user.id);
  }

  // Cliente confirma que ya viene hacia el taxi
  @Patch(':id/client-ready')
  @Roles(UserRole.CLIENT)
  clientReady(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    return this.tripsService.clientReady(id, user.id);
  }

  @Get('me')
  @Roles(UserRole.CLIENT)
  getMyTripsAsClient(
    @CurrentUser() user: User,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.tripsService.getMyTripsAsClient(user.id, page, limit);
  }

  // Incluye otp_code — cliente lo necesita para mostrárselo al conductor
  @Get('me/active')
  @Roles(UserRole.CLIENT)
  getActiveTrip(@CurrentUser() user: User) {
    return this.tripsService.getActiveTrip(user.id);
  }

  // ── Cancelar (múltiples roles) ───────────────────────────────────────────────

  @Patch(':id/cancel')
  @Roles(
    UserRole.CLIENT,
    UserRole.DRIVER,
    UserRole.COOPERATIVE_ADMIN,
    UserRole.COOPERATIVE_OPERATOR,
    UserRole.OWNER,
    UserRole.PLATFORM_ADMIN,
  )
  cancelTrip(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: CancelTripDto,
  ) {
    return this.tripsService.cancelTrip(id, user, dto);
  }

  // ── Admin / monitoring ───────────────────────────────────────────────────────

  @Get()
  @Roles(...PLATFORM_ROLES, ...COOP_ROLES)
  listTrips(
    @Query('status') status: TripStatus,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.tripsService.listTrips(status, page, limit);
  }

  // OTP solo se expone al cliente — lo eliminamos para cualquier otro rol
  @Get(':id')
  @Roles(...PLATFORM_ROLES, ...COOP_ROLES, UserRole.CLIENT, UserRole.DRIVER)
  async getTripById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const trip = await this.tripsService.getTripById(id);
    if (user.role !== UserRole.CLIENT) {
      const { otp_code: _otp, ...safe } = trip as any;
      return safe;
    }
    return trip;
  }
}
