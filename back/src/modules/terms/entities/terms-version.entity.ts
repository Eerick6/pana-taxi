import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum TermsType {
  DRIVER = 'driver',
  CLIENT = 'client',
  COOPERATIVE = 'cooperative',
}

@Entity('terms_versions')
export class TermsVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  version: string; // "1.0", "1.1", "2.0"

  @Column({ type: 'enum', enum: TermsType })
  type: TermsType;

  @Column({ type: 'text' })
  content: string;

  @Column({ default: false })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;
}
