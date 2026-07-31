import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from './entities/plan.entity';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(Plan)
    private readonly planRepo: Repository<Plan>,
  ) {}

  async findAll(): Promise<(Plan & { cooperative_count: number })[]> {
    const allPlans = await this.planRepo.find({ order: { created_at: 'ASC' } });

    // Count distinct active cooperatives per plan via billing_invoices
    const raw: { plan_id: string; cooperative_count: string }[] =
      await this.planRepo.query(`
        SELECT
          p.id AS plan_id,
          COUNT(DISTINCT bi.cooperative_id) AS cooperative_count
        FROM plans p
        LEFT JOIN billing_invoices bi
          ON bi.plan_id = p.id
          AND bi.status NOT IN ('cancelled')
        GROUP BY p.id
      `);

    const countMap = new Map<string, number>(
      raw.map((r) => [r.plan_id, parseInt(r.cooperative_count, 10)]),
    );

    return allPlans.map((plan) => ({
      ...plan,
      cooperative_count: countMap.get(plan.id) ?? 0,
    }));
  }

  async findOne(id: string): Promise<Plan & { cooperative_count: number }> {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException(`Plan ${id} no encontrado`);

    const raw: { cooperative_count: string }[] = await this.planRepo.query(
      `SELECT COUNT(DISTINCT bi.cooperative_id) AS cooperative_count
       FROM billing_invoices bi
       WHERE bi.plan_id = ? AND bi.status NOT IN ('cancelled')`,
      [id],
    );

    return {
      ...plan,
      cooperative_count: parseInt(raw[0]?.cooperative_count ?? '0', 10),
    };
  }

  async create(dto: CreatePlanDto): Promise<Plan> {
    const plan = this.planRepo.create({
      ...dto,
      features: dto.features ?? [],
      commission_pct: dto.commission_pct ?? 10,
      is_active: dto.is_active ?? true,
    });
    return this.planRepo.save(plan);
  }

  async update(id: string, dto: UpdatePlanDto): Promise<Plan> {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException(`Plan ${id} no encontrado`);

    Object.assign(plan, dto);
    return this.planRepo.save(plan);
  }

  async remove(id: string): Promise<{ message: string }> {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException(`Plan ${id} no encontrado`);

    // Prevent deletion if active cooperatives are linked via invoices
    const raw: { linked: string }[] = await this.planRepo.query(
      `SELECT COUNT(DISTINCT bi.cooperative_id) AS linked
       FROM billing_invoices bi
       WHERE bi.plan_id = ? AND bi.status NOT IN ('cancelled')`,
      [id],
    );

    const linkedCount = parseInt(raw[0]?.linked ?? '0', 10);
    if (linkedCount > 0) {
      throw new BadRequestException(
        `No se puede eliminar el plan: ${linkedCount} cooperativa(s) activa(s) lo están usando`,
      );
    }

    await this.planRepo.remove(plan);
    return { message: 'Plan eliminado correctamente' };
  }
}
