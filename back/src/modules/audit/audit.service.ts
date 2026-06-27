import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { QueryAuditDto } from './dto/query-audit.dto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuditEntry {
  actor_id?: string | null;
  actor_role?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  metadata?: Record<string, any> | null;
  ip_address?: string | null;
  status_code?: number;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private logsRepo: Repository<AuditLog>,
  ) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.logsRepo.save(
        this.logsRepo.create({
          actor_id: entry.actor_id ?? null,
          actor_role: entry.actor_role ?? null,
          action: entry.action,
          entity_type: entry.entity_type ?? null,
          entity_id: entry.entity_id ?? null,
          metadata: entry.metadata ?? null,
          ip_address: entry.ip_address ?? null,
          status_code: entry.status_code ?? 200,
        }),
      );
    } catch {
      // Audit failures must never break the main flow
    }
  }

  // Parses HTTP path into entity_type + entity_id + action string
  static parseAction(method: string, path: string): Pick<AuditEntry, 'action' | 'entity_type' | 'entity_id'> {
    const parts = path.replace(/^\//, '').split('/');
    const entityType = parts[0] ?? null;
    let entityId: string | null = null;
    const tailParts: string[] = [];

    for (let i = 1; i < parts.length; i++) {
      if (UUID_RE.test(parts[i])) {
        if (!entityId) entityId = parts[i];
      } else {
        tailParts.push(parts[i]);
      }
    }

    const tail = tailParts.join('/');
    const action = tail ? `${method} ${entityType}/${tail}` : `${method} ${entityType}`;

    return { action, entity_type: entityType, entity_id: entityId };
  }

  async query(filters: QueryAuditDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;

    const qb = this.logsRepo
      .createQueryBuilder('a')
      .orderBy('a.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (filters.actor_id) qb.andWhere('a.actor_id = :actorId', { actorId: filters.actor_id });
    if (filters.entity_type) qb.andWhere('a.entity_type = :et', { et: filters.entity_type });
    if (filters.entity_id) qb.andWhere('a.entity_id = :eid', { eid: filters.entity_id });
    if (filters.action) qb.andWhere('a.action LIKE :action', { action: `%${filters.action}%` });
    if (filters.from) qb.andWhere('a.created_at >= :from', { from: new Date(filters.from) });
    if (filters.to) {
      const to = new Date(filters.to);
      to.setHours(23, 59, 59, 999);
      qb.andWhere('a.created_at <= :to', { to });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }
}
