import { Injectable, NotFoundException, ConflictException, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentMethod } from './entities/payment-method.entity';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';

@Injectable()
export class PaymentMethodsService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(PaymentMethod)
    private repo: Repository<PaymentMethod>,
  ) {}

  async onApplicationBootstrap() {
    await this.seedDefaults();
  }

  async seedDefaults(): Promise<void> {
    const defaults = [
      { name: 'Efectivo', slug: 'cash', description: 'Pago en efectivo al conductor', sort_order: 0 },
      { name: 'Tarjeta', slug: 'card', description: 'Pago con tarjeta de crédito/débito', sort_order: 1, is_active: false },
      { name: 'Billetera digital', slug: 'wallet', description: 'Saldo en la app', sort_order: 2, is_active: false },
    ];

    for (const d of defaults) {
      const exists = await this.repo.findOne({ where: { slug: d.slug } });
      if (!exists) {
        await this.repo.save(this.repo.create(d));
      }
    }
  }

  findAll(onlyActive = false): Promise<PaymentMethod[]> {
    return this.repo.find({
      where: onlyActive ? { is_active: true } : {},
      order: { sort_order: 'ASC' },
    });
  }

  async findOne(id: string): Promise<PaymentMethod> {
    const m = await this.repo.findOne({ where: { id } });
    if (!m) throw new NotFoundException('Método de pago no encontrado');
    return m;
  }

  async create(dto: CreatePaymentMethodDto): Promise<PaymentMethod> {
    const exists = await this.repo.findOne({ where: { slug: dto.slug } });
    if (exists) throw new ConflictException(`Ya existe un método con slug '${dto.slug}'`);
    return this.repo.save(this.repo.create(dto));
  }

  async update(id: string, dto: UpdatePaymentMethodDto): Promise<PaymentMethod> {
    const m = await this.findOne(id);
    if (dto.slug && dto.slug !== m.slug) {
      const conflict = await this.repo.findOne({ where: { slug: dto.slug } });
      if (conflict) throw new ConflictException(`Ya existe un método con slug '${dto.slug}'`);
    }
    Object.assign(m, dto);
    return this.repo.save(m);
  }

  async remove(id: string): Promise<void> {
    const m = await this.findOne(id);
    await this.repo.remove(m);
  }
}
