import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum UserRole {
  OWNER = 'owner',
  PLATFORM_ADMIN = 'platform_admin',
  FINANCE = 'finance',
  SUPPORT = 'support',
  MONITORING = 'monitoring',
  COOPERATIVE_ADMIN = 'cooperative_admin',
  COOPERATIVE_OPERATOR = 'cooperative_operator',
  COOPERATIVE_SUPERVISOR = 'cooperative_supervisor',
  DRIVER = 'driver',
  CLIENT = 'client',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  BANNED = 'banned',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, nullable: true })
  email: string;

  @Column({ unique: true, nullable: true })
  phone: string;

  @Column({ nullable: true })
  password_hash: string;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  status: UserStatus;

  @Column({ nullable: true })
  otp_code: string;

  @Column({ nullable: true })
  otp_expires_at: Date;

  @Column({ nullable: true })
  refresh_token: string;

  // Identifica la sesión activa actual — se regenera en cada login nuevo.
  // Un token con un session_id distinto al guardado aquí queda invalidado
  // de inmediato (sesión única por cuenta, ver JwtStrategy).
  @Column({ nullable: true })
  session_id: string | null;

  // Token de Firebase Cloud Messaging — registrado desde la app al iniciar sesión
  @Column({ nullable: true })
  fcm_token: string | null;

  @Column({ nullable: true })
  terms_version: string;

  @Column({ nullable: true })
  terms_accepted_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Propiedad virtual — NO es columna BD.
  // La inyecta JwtStrategy desde el payload del token para que los controllers
  // de staff de cooperativa siempre tengan su cooperative_id disponible.
  cooperative_id?: string | null;
}
