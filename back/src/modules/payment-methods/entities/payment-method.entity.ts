import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum PaymentMethodSlug {
  CASH = 'cash',
  CARD = 'card',
  WALLET = 'wallet',
}

@Entity('payment_methods')
export class PaymentMethod {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Nombre legible: "Efectivo", "Tarjeta", "Billetera digital"
  @Column({ length: 100 })
  name: string;

  // Identificador único para integraciones: cash, card, wallet, stripe, etc.
  @Column({ length: 50, unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  // URL del ícono (para la app móvil)
  @Column({ length: 255, nullable: true })
  icon_url: string;

  // Si este método está disponible para los pasajeros
  @Column({ default: true })
  is_active: boolean;

  // Orden de presentación en la app
  @Column({ type: 'smallint', default: 0 })
  sort_order: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
