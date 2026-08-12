import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn, Index,
} from 'typeorm';
import { Conversation } from './conversation.entity';
import { User } from '../../users/entities/user.entity';

@Entity('chat_messages')
@Index('IDX_chat_messages_conversation_created', ['conversation_id', 'created_at'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @Column()
  conversation_id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'sender_id' })
  sender: User;

  @Column()
  sender_id: string;

  @Column({ type: 'text' })
  content: string;

  // null = no leído por el destinatario
  @Column({ nullable: true })
  read_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
