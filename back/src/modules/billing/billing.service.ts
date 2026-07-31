import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';
import { BillingPayment, PaymentStatus } from './entities/billing-payment.entity';

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface InvoiceListQuery {
  status?: InvoiceStatus;
  cooperative_id?: string;
  page?: number;
  limit?: number;
}

export interface PaymentListQuery {
  status?: PaymentStatus;
  page?: number;
  limit?: number;
}

export interface RenewalEntry {
  cooperative_id: string;
  cooperative_name: string;
  plan_name: string;
  renews_at: Date;
  amount: number;
  status: 'upcoming' | 'overdue' | 'cancelled';
}

export interface BillingStats {
  total_billed: number;
  total_paid: number;
  total_pending: number;
  total_overdue: number;
  active_subscriptions: number;
}

@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(BillingPayment)
    private readonly paymentRepo: Repository<BillingPayment>,
  ) {}

  // ── Invoices ─────────────────────────────────────────────────────────────────

  async findInvoices(query: InvoiceListQuery): Promise<PaginatedResult<Invoice>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.invoiceRepo
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.cooperative', 'cooperative')
      .leftJoinAndSelect('invoice.plan', 'plan')
      .orderBy('invoice.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.status) {
      qb.andWhere('invoice.status = :status', { status: query.status });
    }
    if (query.cooperative_id) {
      qb.andWhere('invoice.cooperative_id = :cooperative_id', {
        cooperative_id: query.cooperative_id,
      });
    }

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async markInvoicePaid(id: string): Promise<Invoice> {
    const invoice = await this.invoiceRepo.findOne({ where: { id } });
    if (!invoice) throw new NotFoundException(`Factura ${id} no encontrada`);

    invoice.status = InvoiceStatus.PAID;
    invoice.paid_at = new Date();
    return this.invoiceRepo.save(invoice);
  }

  // ── Payments ─────────────────────────────────────────────────────────────────

  async findPayments(query: PaymentListQuery): Promise<PaginatedResult<BillingPayment>> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.paymentRepo
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.invoice', 'invoice')
      .leftJoinAndSelect('payment.cooperative', 'cooperative')
      .orderBy('payment.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.status) {
      qb.andWhere('payment.status = :status', { status: query.status });
    }

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async confirmPayment(id: string): Promise<BillingPayment> {
    const payment = await this.paymentRepo.findOne({
      where: { id },
      relations: ['invoice'],
    });
    if (!payment) throw new NotFoundException(`Pago ${id} no encontrado`);

    payment.status = PaymentStatus.CONFIRMED;
    payment.paid_at = new Date();
    const saved = await this.paymentRepo.save(payment);

    // Also mark the linked invoice as paid if it exists
    if (payment.invoice_id) {
      const invoice = await this.invoiceRepo.findOne({
        where: { id: payment.invoice_id },
      });
      if (invoice && invoice.status !== InvoiceStatus.PAID) {
        invoice.status = InvoiceStatus.PAID;
        invoice.paid_at = new Date();
        await this.invoiceRepo.save(invoice);
      }
    }

    return saved;
  }

  async rejectPayment(id: string): Promise<BillingPayment> {
    const payment = await this.paymentRepo.findOne({ where: { id } });
    if (!payment) throw new NotFoundException(`Pago ${id} no encontrado`);

    payment.status = PaymentStatus.FAILED;
    return this.paymentRepo.save(payment);
  }

  // ── Renewals ─────────────────────────────────────────────────────────────────

  async getRenewals(): Promise<RenewalEntry[]> {
    // Get the latest non-cancelled invoice per cooperative and derive next renewal date
    const rows: {
      cooperative_id: string;
      cooperative_name: string;
      plan_name: string;
      due_date: string;
      total: string;
      status: string;
    }[] = await this.invoiceRepo.query(`
      SELECT
        i.cooperative_id,
        c.name AS cooperative_name,
        p.name AS plan_name,
        i.due_date,
        i.total,
        i.status
      FROM billing_invoices i
      INNER JOIN (
        SELECT cooperative_id, MAX(due_date) AS latest_due_date
        FROM billing_invoices
        WHERE status != 'cancelled'
        GROUP BY cooperative_id
      ) latest ON i.cooperative_id = latest.cooperative_id
                AND i.due_date = latest.latest_due_date
      LEFT JOIN cooperatives c ON c.id = i.cooperative_id
      LEFT JOIN plans p ON p.id = i.plan_id
      WHERE i.status != 'cancelled'
      ORDER BY i.due_date ASC
    `);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return rows.map((row) => {
      const dueDate = new Date(row.due_date);
      // Compute next renewal: one month after the latest invoice due_date
      const renewsAt = new Date(dueDate);
      renewsAt.setMonth(renewsAt.getMonth() + 1);

      let renewalStatus: 'upcoming' | 'overdue' | 'cancelled';
      if (row.status === InvoiceStatus.CANCELLED) {
        renewalStatus = 'cancelled';
      } else if (renewsAt < today) {
        renewalStatus = 'overdue';
      } else {
        renewalStatus = 'upcoming';
      }

      return {
        cooperative_id: row.cooperative_id,
        cooperative_name: row.cooperative_name ?? 'Sin nombre',
        plan_name: row.plan_name ?? 'Sin plan',
        renews_at: renewsAt,
        amount: parseFloat(row.total),
        status: renewalStatus,
      };
    });
  }

  // ── Stats ─────────────────────────────────────────────────────────────────────

  async getStats(): Promise<BillingStats> {
    const statsRaw: {
      total_billed: string;
      total_paid: string;
      total_pending: string;
      total_overdue: string;
    }[] = await this.invoiceRepo.query(`
      SELECT
        COALESCE(SUM(total), 0)                                           AS total_billed,
        COALESCE(SUM(CASE WHEN status = 'paid'    THEN total ELSE 0 END), 0) AS total_paid,
        COALESCE(SUM(CASE WHEN status IN ('draft','sent') THEN total ELSE 0 END), 0) AS total_pending,
        COALESCE(SUM(CASE WHEN status = 'overdue' THEN total ELSE 0 END), 0) AS total_overdue
      FROM billing_invoices
      WHERE status != 'cancelled'
    `);

    const activeSubsRaw: { active_subscriptions: string }[] =
      await this.invoiceRepo.query(`
        SELECT COUNT(DISTINCT cooperative_id) AS active_subscriptions
        FROM billing_invoices
        WHERE status = 'paid'
          AND period_to >= CURDATE()
      `);

    const s = statsRaw[0];
    return {
      total_billed: parseFloat(s.total_billed),
      total_paid: parseFloat(s.total_paid),
      total_pending: parseFloat(s.total_pending),
      total_overdue: parseFloat(s.total_overdue),
      active_subscriptions: parseInt(activeSubsRaw[0]?.active_subscriptions ?? '0', 10),
    };
  }
}
