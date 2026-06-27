import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('audit_logs')
@Index(['actor_id'])
@Index(['entity_type', 'entity_id'])
@Index(['created_at'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  actor_id: string | null;

  @Column({ nullable: true })
  actor_role: string | null;

  // HTTP verb + path, e.g. "PATCH /cooperatives/:id/approve"
  @Column()
  action: string;

  // Parsed from path, e.g. "cooperatives", "drivers", "trips"
  @Column({ nullable: true })
  entity_type: string | null;

  // UUID extracted from the path segment after entity_type
  @Column({ nullable: true })
  entity_id: string | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, any> | null;

  @Column({ nullable: true })
  ip_address: string | null;

  @Column({ default: 200 })
  status_code: number;

  @CreateDateColumn()
  created_at: Date;
}
