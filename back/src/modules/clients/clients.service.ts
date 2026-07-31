import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from './entities/client.entity';
import { EmergencyContact } from './entities/emergency-contact.entity';
import { User, UserStatus } from '../users/entities/user.entity';
import { StorageService } from '../storage/storage.service';
import { LocalStorageService } from '../storage/local-storage.service';
import { UpdateClientDto } from './dto/update-client.dto';
import { AddEmergencyContactDto } from './dto/add-emergency-contact.dto';

const MAX_EMERGENCY_CONTACTS = 3;

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private clientsRepo: Repository<Client>,
    @InjectRepository(EmergencyContact)
    private contactsRepo: Repository<EmergencyContact>,
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    private storage: StorageService,
    private localStorage: LocalStorageService,
  ) {}

  async getMyProfile(userId: string) {
    const client = await this.clientsRepo.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });
    if (!client) throw new NotFoundException('Perfil de cliente no encontrado');

    const { otp_code, otp_expires_at, refresh_token, password_hash, ...user } = client.user as any;

    // Solo servir fotos en disco local ("local:..."); limpiar keys R2 legacy
    const raw = client.profile_photo_url;
    let photoUrl: string | null = null;
    if (raw) {
      if (this.localStorage.isLocal(raw)) {
        photoUrl = this.localStorage.staticPath(raw);
      } else {
        // Key R2 antigua — limpiar del DB para que el usuario suba de nuevo
        await this.clientsRepo.update(client.id, { profile_photo_url: null });
      }
    }

    return { ...client, user, profile_photo_url: photoUrl };
  }

  async updateMyProfile(userId: string, dto: UpdateClientDto) {
    const client = await this.clientsRepo.findOne({ where: { user: { id: userId } } });
    if (!client) throw new NotFoundException('Perfil de cliente no encontrado');

    await this.clientsRepo.update(client.id, dto);
    return { message: 'Perfil actualizado' };
  }

  async uploadPhoto(userId: string, file: Express.Multer.File) {
    const client = await this.clientsRepo.findOne({ where: { user: { id: userId } } });
    if (!client) throw new NotFoundException('Perfil de cliente no encontrado');

    if (!file) throw new BadRequestException('Archivo requerido');
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) throw new BadRequestException('Solo JPEG, PNG o WebP');
    if (file.size > 5 * 1024 * 1024) throw new BadRequestException('Máximo 5MB');

    const key = this.localStorage.save(`clients/${client.id}`, file.buffer, file.originalname);
    await this.clientsRepo.update(client.id, { profile_photo_url: key });
    return { profile_photo_url: key };
  }

  // ── Contactos de emergencia ─────────────────────────────────────────────────

  async addEmergencyContact(userId: string, dto: AddEmergencyContactDto) {
    const client = await this.clientsRepo.findOne({ where: { user: { id: userId } } });
    if (!client) throw new NotFoundException('Perfil de cliente no encontrado');

    const count = await this.contactsRepo.count({ where: { client: { id: client.id } } });
    if (count >= MAX_EMERGENCY_CONTACTS) {
      throw new ForbiddenException(`Máximo ${MAX_EMERGENCY_CONTACTS} contactos de emergencia`);
    }

    const contact = await this.contactsRepo.save(
      this.contactsRepo.create({ client, ...dto }),
    );
    return contact;
  }

  async getEmergencyContacts(userId: string) {
    const client = await this.clientsRepo.findOne({ where: { user: { id: userId } } });
    if (!client) throw new NotFoundException('Perfil de cliente no encontrado');

    return this.contactsRepo.find({
      where: { client: { id: client.id } },
      order: { created_at: 'ASC' },
    });
  }

  async removeEmergencyContact(userId: string, contactId: string) {
    const client = await this.clientsRepo.findOne({ where: { user: { id: userId } } });
    if (!client) throw new NotFoundException('Perfil de cliente no encontrado');

    const contact = await this.contactsRepo.findOne({
      where: { id: contactId, client: { id: client.id } },
    });
    if (!contact) throw new NotFoundException('Contacto no encontrado');

    await this.contactsRepo.delete(contactId);
    return { message: 'Contacto eliminado' };
  }

  // ── Admin ───────────────────────────────────────────────────────────────────

  async listClients(page = 1, limit = 20, search?: string) {
    const qb = this.clientsRepo.createQueryBuilder('c')
      .leftJoinAndSelect('c.user', 'u')
      .orderBy('c.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (search) {
      qb.andWhere(
        '(c.full_name LIKE :q OR u.email LIKE :q OR u.phone LIKE :q)',
        { q: `%${search}%` },
      );
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async getClientById(id: string) {
    const client = await this.clientsRepo.findOne({ where: { id }, relations: ['user'] });
    if (!client) throw new NotFoundException('Cliente no encontrado');

    const contacts = await this.contactsRepo.find({ where: { client: { id } } });
    return { ...client, emergency_contacts: contacts };
  }

  async blockClient(id: string) {
    const client = await this.clientsRepo.findOne({ where: { id }, relations: ['user'] });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    await this.usersRepo.update(client.user.id, { status: UserStatus.SUSPENDED });
    return { message: 'Cliente suspendido correctamente' };
  }

  async unblockClient(id: string) {
    const client = await this.clientsRepo.findOne({ where: { id }, relations: ['user'] });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    await this.usersRepo.update(client.user.id, { status: UserStatus.ACTIVE });
    return { message: 'Cliente reactivado correctamente' };
  }
}
