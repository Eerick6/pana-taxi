class BankAccountModel {
  const BankAccountModel({
    required this.id,
    required this.bankName,
    required this.accountNumber,
    required this.accountHolder,
    required this.accountType,
    this.idNumber,
    this.logoUrl,
    this.notes,
  });

  final String id;
  final String bankName;
  final String accountNumber;
  final String accountHolder;
  final String accountType;
  final String? idNumber;
  final String? logoUrl;
  final String? notes;

  String get accountTypeLabel => accountType == 'savings' ? 'Ahorros' : 'Corriente';

  factory BankAccountModel.fromJson(Map<String, dynamic> json) => BankAccountModel(
        id: json['id'] as String,
        bankName: json['bank_name'] as String,
        accountNumber: json['account_number'] as String,
        accountHolder: json['account_holder'] as String,
        accountType: json['account_type'] as String? ?? 'savings',
        idNumber: json['id_number'] as String?,
        logoUrl: json['logo_url'] as String?,
        notes: json['notes'] as String?,
      );
}

class RechargeModel {
  const RechargeModel({
    required this.id,
    required this.amount,
    required this.status,
    required this.createdAt,
    this.bankAccountName,
    this.driverNotes,
    this.rejectionReason,
  });

  final String id;
  final double amount;
  final String status;
  final DateTime createdAt;
  final String? bankAccountName;
  final String? driverNotes;
  final String? rejectionReason;

  bool get isPending   => status == 'pending';
  bool get isConfirmed => status == 'confirmed';
  bool get isRejected  => status == 'rejected';

  factory RechargeModel.fromJson(Map<String, dynamic> json) {
    final ba = json['bank_account'] as Map<String, dynamic>?;
    return RechargeModel(
      id: json['id'] as String,
      amount: double.parse(json['amount'].toString()),
      status: json['status'] as String? ?? 'pending',
      createdAt: DateTime.parse(json['created_at'] as String),
      bankAccountName: ba?['bank_name'] as String?,
      driverNotes: json['driver_notes'] as String?,
      rejectionReason: json['rejection_reason'] as String?,
    );
  }
}

class WalletModel {
  const WalletModel({
    required this.id,
    required this.balance,
    required this.currency,
    this.cardBalance = 0,
  });
  final String id;
  final double balance;
  final String currency;
  // Lo que la plataforma te debe por viajes cobrados con tarjeta — se paga
  // aparte (transferencia/efectivo), no es plata disponible en la app.
  final double cardBalance;

  factory WalletModel.fromJson(Map<String, dynamic> json) => WalletModel(
        id: json['id'] as String,
        balance: double.parse(json['balance'].toString()),
        currency: json['currency'] as String? ?? 'USD',
        cardBalance: double.parse((json['card_balance'] ?? '0').toString()),
      );
}

class TransactionModel {
  const TransactionModel({
    required this.id,
    required this.type,
    required this.amount,
    required this.description,
    required this.createdAt,
    this.referenceId,
  });

  final String id;
  final String type;
  final double amount;
  final String description;
  final DateTime createdAt;
  final String? referenceId;

  bool get isCredit => type == 'recharge' || type == 'refund' || type == 'adjustment' || type == 'card_earning';

  factory TransactionModel.fromJson(Map<String, dynamic> json) => TransactionModel(
        id: json['id'] as String,
        type: json['type'] as String,
        amount: double.parse(json['amount'].toString()),
        description: json['notes'] as String? ?? '',
        createdAt: DateTime.parse(json['created_at'] as String),
        referenceId: json['reference_id'] as String?,
      );
}
