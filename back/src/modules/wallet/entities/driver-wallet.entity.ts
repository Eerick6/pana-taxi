import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, UpdateDateColumn } from 'typeorm';
import { Driver } from '../../drivers/entities/driver.entity';

@Entity('driver_wallets')
export class DriverWallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Driver)
  @JoinColumn({ name: 'driver_id' })
  driver: Driver;

  // Saldo prepago — lo que el conductor le debe a la plataforma por comisión
  // de viajes en efectivo (puede ir negativo).
  @Column({ type: 'decimal', precision: 10, scale: 2, default: '0.00' })
  balance: string;

  // Dirección opuesta: lo que la plataforma le debe al conductor por viajes
  // cobrados con tarjeta (Payphone) — la plata la recibe la plataforma, no
  // el conductor, así que se acumula acá hasta el pago/cierre semanal.
  @Column({ type: 'decimal', precision: 10, scale: 2, default: '0.00' })
  card_balance: string;

  @UpdateDateColumn()
  updated_at: Date;
}
