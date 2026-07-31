import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum AccountType {
  SAVINGS  = 'savings',
  CHECKING = 'checking',
}

@Entity('bank_accounts')
export class BankAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  bank_name: string;

  @Column()
  account_number: string;

  @Column()
  account_holder: string;

  @Column({ type: 'enum', enum: AccountType })
  account_type: AccountType;

  @Column({ nullable: true })
  id_number: string;

  @Column({ nullable: true })
  logo_url: string;

  @Column({ nullable: true })
  notes: string;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
