import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { encryptTransformer } from '../../../common/transformers/encrypt.transformer';

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  full_name: string;

  // Stored encrypted (AES-256-GCM), auto decrypted on read
  @Column({ transformer: encryptTransformer })
  cedula: string;

  // HMAC of raw cédula — used for unique-index lookups without decrypting
  @Column({ unique: true, select: false })
  cedula_hash: string;

  @Column({ nullable: true })
  profile_photo_url: string;

  // Token de tarjeta guardada (Payphone) para cobros sin reingresar datos —
  // requiere que Payphone haya aprobado tokenización para esta cuenta.
  @Column({ nullable: true })
  payphone_card_token: string | null;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 5.0 })
  rating: number;

  @Column({ default: 0 })
  total_trips: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
