import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, UpdateDateColumn } from 'typeorm';
import { Driver } from '../../drivers/entities/driver.entity';

@Entity('driver_wallets')
export class DriverWallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Driver)
  @JoinColumn({ name: 'driver_id' })
  driver: Driver;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: '0.00' })
  balance: string;

  @UpdateDateColumn()
  updated_at: Date;
}
