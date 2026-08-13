import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/constants/ecuadorian_banks.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../data/models/wallet_model.dart';
import '../../data/providers/wallet_provider.dart';
import '../../data/repositories/wallet_repository.dart';
import '../../../../core/network/socket_client.dart';

// ── Date formatting helpers (no locale → no hot-reload crash) ─────────────────

String _fmtCurrency(double v) {
  final neg = v < 0;
  final abs = v.abs();
  final parts = abs.toStringAsFixed(2).split('.');
  final intPart = parts[0]
      .replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');
  return '${neg ? '-' : ''}\$$intPart.${parts[1]}';
}

String _fmtDate(DateTime d) {
  const months = [
    '', 'ene', 'feb', 'mar', 'abr', 'may', 'jun',
    'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
  ];
  final h = d.hour.toString().padLeft(2, '0');
  final m = d.minute.toString().padLeft(2, '0');
  return '${d.day} ${months[d.month]}, $h:$m';
}

// ── Page ──────────────────────────────────────────────────────────────────────

class WalletPage extends ConsumerStatefulWidget {
  const WalletPage({super.key});

  @override
  ConsumerState<WalletPage> createState() => _WalletPageState();
}

class _WalletPageState extends ConsumerState<WalletPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _listenSocket());
  }

  void _listenSocket() {
    final socket = ref.read(socketClientProvider);
    socket.on('wallet.recharge_approved', _onApproved);
    socket.on('wallet.recharge_rejected', _onRejected);
  }

  void _onApproved(dynamic data) {
    if (!mounted) return;
    ref.invalidate(walletProvider);
    ref.invalidate(transactionsProvider);
    ref.invalidate(myRechargesProvider);
    final amount = (data as Map<String, dynamic>?)?['amount'] ?? '';
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text('Recarga de \$$amount aprobada y acreditada'),
      backgroundColor: Colors.green,
      behavior: SnackBarBehavior.floating,
    ));
  }

  void _onRejected(dynamic data) {
    if (!mounted) return;
    ref.invalidate(myRechargesProvider);
    final reason = (data as Map<String, dynamic>?)?['reason'] ?? 'Recarga rechazada';
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(reason.toString()),
      backgroundColor: AppColors.error,
      behavior: SnackBarBehavior.floating,
    ));
  }

  @override
  void dispose() {
    final socket = ref.read(socketClientProvider);
    socket.off('wallet.recharge_approved');
    socket.off('wallet.recharge_rejected');
    super.dispose();
  }

  void _refresh() {
    ref.invalidate(walletProvider);
    ref.invalidate(transactionsProvider);
    ref.invalidate(myRechargesProvider);
  }

  @override
  Widget build(BuildContext context) {
    final walletAsync = ref.watch(walletProvider);

    return DefaultTabController(
      length: 2,
      child: Scaffold(
        backgroundColor: AppColors.gray50,
        body: NestedScrollView(
          headerSliverBuilder: (_, __) => [
            SliverToBoxAdapter(
              child: walletAsync.when(
                loading: () => const _BalanceCardSkeleton(),
                error: (_, __) => _BalanceCard(
                  wallet: WalletModel(id: '', balance: 0, currency: 'USD'),
                  onRecharge: () => _openRechargeFlow(context, ref),
                ),
                data: (w) => _BalanceCard(
                  wallet: w,
                  onRecharge: () => _openRechargeFlow(context, ref),
                ),
              ),
            ),
            SliverPersistentHeader(
              pinned: true,
              delegate: _TabBarDelegate(
                TabBar(
                  labelColor: AppColors.primary,
                  unselectedLabelColor: AppColors.gray400,
                  indicatorColor: AppColors.primary,
                  indicatorWeight: 2,
                  labelStyle: AppTextStyles.label,
                  tabs: const [
                    Tab(text: 'Movimientos'),
                    Tab(text: 'Mis recargas'),
                  ],
                ),
              ),
            ),
          ],
          body: TabBarView(
            children: [
              _TransactionsTab(onRefresh: _refresh),
              _RechargesTab(
                onRefresh: _refresh,
                onResubmit: () => _openRechargeFlow(context, ref),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Balance card ──────────────────────────────────────────────────────────────

class _BalanceCard extends StatelessWidget {
  const _BalanceCard({required this.wallet, required this.onRecharge});
  final WalletModel wallet;
  final VoidCallback onRecharge;

  @override
  Widget build(BuildContext context) {
    final isNeg = wallet.balance < 0;
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: isNeg
              ? [const Color(0xFF7F0000), const Color(0xFF3D0000)]
              : [AppColors.secondary, const Color(0xFF2D2D2D)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.2),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            const Icon(Icons.account_balance_wallet,
                color: AppColors.primary, size: 20),
            const SizedBox(width: 8),
            Text('Mi billetera',
                style: AppTextStyles.label.copyWith(color: AppColors.gray400)),
          ]),
          const SizedBox(height: 16),
          Text(
            _fmtCurrency(wallet.balance),
            style: AppTextStyles.h1.copyWith(
              color: isNeg ? const Color(0xFFFFCDD2) : AppColors.white,
              fontSize: 36,
            ),
          ),
          const SizedBox(height: 4),
          Text(wallet.currency,
              style: AppTextStyles.caption.copyWith(color: AppColors.gray400)),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              icon: const Icon(Icons.add, size: 18),
              label: const Text('Solicitar recarga'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: AppColors.secondary,
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
                elevation: 0,
                textStyle: AppTextStyles.btn,
              ),
              onPressed: onRecharge,
            ),
          ),
          if (wallet.cardBalance > 0) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.06),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  const Icon(Icons.credit_card, color: AppColors.primary, size: 18),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Por cobrar (viajes con tarjeta)',
                            style: AppTextStyles.caption.copyWith(color: AppColors.gray400)),
                        Text(_fmtCurrency(wallet.cardBalance),
                            style: AppTextStyles.label.copyWith(color: AppColors.white)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _BalanceCardSkeleton extends StatelessWidget {
  const _BalanceCardSkeleton();

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.all(16),
        height: 175,
        decoration: BoxDecoration(
          color: AppColors.gray200,
          borderRadius: BorderRadius.circular(20),
        ),
      );
}

// ── Sticky tab bar ────────────────────────────────────────────────────────────

class _TabBarDelegate extends SliverPersistentHeaderDelegate {
  const _TabBarDelegate(this.tabBar);
  final TabBar tabBar;

  @override
  double get minExtent => tabBar.preferredSize.height;
  @override
  double get maxExtent => tabBar.preferredSize.height;

  @override
  Widget build(BuildContext ctx, double shrinkOffset, bool overlaps) =>
      Container(color: AppColors.white, child: tabBar);

  @override
  bool shouldRebuild(_TabBarDelegate old) => false;
}

// ── Transactions tab ──────────────────────────────────────────────────────────

class _TransactionsTab extends ConsumerWidget {
  const _TransactionsTab({required this.onRefresh});
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final txAsync = ref.watch(transactionsProvider);
    return RefreshIndicator(
      onRefresh: () async => onRefresh(),
      child: txAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) =>
            Center(child: Text('Error: $e', style: AppTextStyles.caption)),
        data: (txs) => txs.isEmpty
            ? _emptyState(
                icon: Icons.receipt_long_outlined,
                label: 'Sin movimientos aún',
              )
            : ListView.builder(
                padding: const EdgeInsets.symmetric(vertical: 8),
                itemCount: txs.length,
                itemBuilder: (_, i) => _TxTile(tx: txs[i]),
              ),
      ),
    );
  }
}

class _TxTile extends StatelessWidget {
  const _TxTile({required this.tx});
  final TransactionModel tx;

  @override
  Widget build(BuildContext context) {
    final isCredit = tx.isCredit;
    final (icon, color) = switch (tx.type) {
      'recharge' => (Icons.add_circle_outline, Colors.blue),
      'commission_deduction' => (Icons.percent, AppColors.error),
      'refund' => (Icons.undo_outlined, AppColors.success),
      _ => (Icons.swap_horiz, AppColors.gray400),
    };
    final typeLabel = switch (tx.type) {
      'recharge' => 'Recarga',
      'commission_deduction' => 'Comisión',
      'refund' => 'Reembolso',
      _ => 'Ajuste',
    };

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
      ),
      child: ListTile(
        leading: Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: color.withOpacity(0.12),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: color, size: 22),
        ),
        title: Text(typeLabel, style: AppTextStyles.label),
        subtitle: Text(_fmtDate(tx.createdAt.toLocal()),
            style: AppTextStyles.caption),
        trailing: Text(
          '${isCredit ? '+' : '-'}${_fmtCurrency(tx.amount.abs())}',
          style: AppTextStyles.labelLg
              .copyWith(color: isCredit ? AppColors.success : AppColors.errorText),
        ),
      ),
    );
  }
}

// ── Recharges tab ─────────────────────────────────────────────────────────────

class _RechargesTab extends ConsumerWidget {
  const _RechargesTab({required this.onRefresh, required this.onResubmit});
  final VoidCallback onRefresh;
  final VoidCallback onResubmit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rechargesAsync = ref.watch(myRechargesProvider);
    return RefreshIndicator(
      onRefresh: () async => onRefresh(),
      child: rechargesAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) =>
            Center(child: Text('Error: $e', style: AppTextStyles.caption)),
        data: (list) => list.isEmpty
            ? _emptyState(
                icon: Icons.payments_outlined,
                label: 'No has solicitado recargas',
                sub: 'Usa el botón "Solicitar recarga"',
              )
            : ListView.builder(
                padding: const EdgeInsets.symmetric(vertical: 8),
                itemCount: list.length,
                itemBuilder: (_, i) => _RechargeTile(r: list[i], onResubmit: onResubmit),
              ),
      ),
    );
  }
}

class _RechargeTile extends StatelessWidget {
  const _RechargeTile({required this.r, required this.onResubmit});
  final RechargeModel r;
  final VoidCallback onResubmit;

  @override
  Widget build(BuildContext context) {
    final (color, label, icon) = switch (r.status) {
      'confirmed' => (AppColors.success, 'Confirmada', Icons.check_circle_outline),
      'rejected' => (AppColors.error, 'Rechazada', Icons.cancel_outlined),
      _ => (const Color(0xFF2563EB), 'En revisión', Icons.hourglass_top_rounded),
    };

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(12),
        border: r.isConfirmed
            ? Border.all(color: AppColors.success.withOpacity(0.35))
            : r.isRejected
                ? Border.all(color: AppColors.error.withOpacity(0.3))
                : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(
                child: Text(_fmtCurrency(r.amount),
                    style: AppTextStyles.labelLg)),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: color.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(icon, size: 13, color: color),
                const SizedBox(width: 4),
                Text(label,
                    style: AppTextStyles.caption.copyWith(color: color)),
              ]),
            ),
          ]),
          const SizedBox(height: 6),
          if (r.bankAccountName != null)
            Text(r.bankAccountName!,
                style:
                    AppTextStyles.caption.copyWith(color: AppColors.gray500)),
          Text(_fmtDate(r.createdAt.toLocal()),
              style: AppTextStyles.caption),
          if (r.isRejected) ...[
            const SizedBox(height: 8),
            if (r.rejectionReason != null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.errorLight,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text('Motivo: ${r.rejectionReason}',
                    style: AppTextStyles.caption.copyWith(color: AppColors.errorText)),
              ),
            const SizedBox(height: 10),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: onResubmit,
                icon: const Icon(Icons.upload_file_outlined, size: 16),
                label: const Text('Volver a solicitar'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.primary,
                  side: BorderSide(color: AppColors.primary.withOpacity(0.5)),
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  textStyle: AppTextStyles.caption.copyWith(fontWeight: FontWeight.w600),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ── Bank logo widget ──────────────────────────────────────────────────────────

class _BankLogo extends StatelessWidget {
  const _BankLogo({required this.bankInfo, this.logoUrl, this.size = 44});
  final EcuadorianBankInfo bankInfo;
  final String? logoUrl;
  final double size;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(size * 0.22);

    Widget colorBox({Widget? child}) => Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            color: bankInfo.color,
            borderRadius: radius,
          ),
          child: child ??
              Center(
                child: Text(
                  bankInfo.abbr,
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: size * 0.27,
                  ),
                ),
              ),
        );

    final effectiveLogo = (logoUrl != null && logoUrl!.isNotEmpty)
        ? logoUrl!
        : bankInfo.logoUrl;
    if (effectiveLogo.isEmpty) return colorBox();

    return ClipRRect(
      borderRadius: radius,
      child: CachedNetworkImage(
        imageUrl: effectiveLogo,
        width: size,
        height: size,
        fit: BoxFit.cover,
        placeholder: (_, __) => colorBox(
          child: const Center(
            child: SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Colors.white54,
              ),
            ),
          ),
        ),
        errorWidget: (_, __, ___) => colorBox(),
      ),
    );
  }
}

// ── Shared empty state ────────────────────────────────────────────────────────

Widget _emptyState({
  required IconData icon,
  required String label,
  String? sub,
}) =>
    ListView(children: [
      SizedBox(
        height: 280,
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 56, color: AppColors.gray300),
              const SizedBox(height: 12),
              Text(label,
                  style: AppTextStyles.body
                      .copyWith(color: AppColors.gray400)),
              if (sub != null) ...[
                const SizedBox(height: 4),
                Text(sub, style: AppTextStyles.caption),
              ],
            ],
          ),
        ),
      ),
    ]);

// ── Recharge flow entry point ─────────────────────────────────────────────────

Future<void> _openRechargeFlow(BuildContext context, WidgetRef ref) async {
  // Ensure bank accounts are loaded
  await ref.read(bankAccountsProvider.future).then((_) {}).catchError((_) {});
  final banks = ref.read(bankAccountsProvider).valueOrNull ?? [];

  if (!context.mounted) return;

  if (banks.isEmpty) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
            'No hay cuentas bancarias disponibles. Contacta al administrador.'),
        behavior: SnackBarBehavior.floating,
      ),
    );
    return;
  }

  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _RechargeSheet(banks: banks, parentRef: ref, pageContext: context),
  );
}

// ── Bottom sheet ──────────────────────────────────────────────────────────────

class _RechargeSheet extends StatefulWidget {
  const _RechargeSheet({required this.banks, required this.parentRef, required this.pageContext});
  final List<BankAccountModel> banks;
  final WidgetRef parentRef;
  final BuildContext pageContext;

  @override
  State<_RechargeSheet> createState() => _RechargeSheetState();
}

class _RechargeSheetState extends State<_RechargeSheet> {
  int _step = 0; // 0 = pick bank, 1 = fill form
  BankAccountModel? _bank;
  final _amountCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  XFile? _proof;
  bool _loading = false;

  @override
  void dispose() {
    _amountCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickImage() async {
    final img = await ImagePicker()
        .pickImage(source: ImageSource.gallery, imageQuality: 80);
    if (img != null) setState(() => _proof = img);
  }

  Future<void> _submit() async {
    final amount =
        double.tryParse(_amountCtrl.text.trim().replaceAll(',', '.'));
    if (amount == null || amount <= 0) {
      _snack('Ingresa un monto válido');
      return;
    }
    if (amount < 5) { _snack('Recarga mínima: \$5.00'); return; }
    if (amount > 500) { _snack('Recarga máxima: \$500.00'); return; }
    if (_proof == null) { _snack('Adjunta el comprobante'); return; }

    setState(() => _loading = true);
    try {
      await widget.parentRef.read(walletRepositoryProvider).requestRecharge(
            amount: amount,
            bankAccountId: _bank!.id,
            filePath: _proof!.path,
            mimeType: _proof!.mimeType ?? 'image/jpeg',
            driverNotes: _notesCtrl.text.trim(),
          );
      if (mounted) {
        Navigator.pop(context);
        widget.parentRef.invalidate(myRechargesProvider);
        _showConfirmationDialog(widget.pageContext);
      }
    } catch (e) {
      if (mounted) {
        final msg = e
            .toString()
            .replaceAll('Exception: ', '')
            .replaceAll('DioException', 'Error de conexión');
        _snack(msg.length > 120 ? '${msg.substring(0, 120)}…' : msg);
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _snack(String msg) => ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg), behavior: SnackBarBehavior.floating),
      );

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding:
          EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Handle
              Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(top: 12, bottom: 4),
                decoration: BoxDecoration(
                  color: AppColors.gray300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              // Header
              Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                child: Row(children: [
                  if (_step == 1)
                    IconButton(
                      icon: const Icon(Icons.arrow_back_ios_new, size: 18),
                      onPressed: () => setState(() => _step = 0),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                    ),
                  if (_step == 1) const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _step == 0
                          ? 'Elegir cuenta bancaria'
                          : 'Datos de la recarga',
                      style: AppTextStyles.h3,
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(context),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
                ]),
              ),
              const Divider(height: 1),
              if (_step == 0) _buildBankStep() else _buildFormStep(),
            ],
          ),
        ),
      ),
    );
  }

  // Step 0: bank list
  Widget _buildBankStep() {
    return ConstrainedBox(
      constraints: BoxConstraints(
          maxHeight: MediaQuery.of(context).size.height * 0.62),
      child: ListView.separated(
        shrinkWrap: true,
        padding: const EdgeInsets.all(16),
        itemCount: widget.banks.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (_, i) => _BankCard(
          bank: widget.banks[i],
          onSelect: () => setState(() {
            _bank = widget.banks[i];
            _step = 1;
          }),
        ),
      ),
    );
  }

  // Step 1: amount + proof + notes
  Widget _buildFormStep() {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Bank recap
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.gray50,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(children: [
              _BankLogo(bankInfo: getBankInfo(_bank!.bankName), logoUrl: _bank!.logoUrl, size: 36),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(_bank!.bankName, style: AppTextStyles.label),
                      Text(
                        '${_bank!.accountTypeLabel} · ${_bank!.accountNumber}',
                        style: AppTextStyles.caption,
                      ),
                    ]),
              ),
            ]),
          ),
          const SizedBox(height: 18),
          Text('Monto a recargar', style: AppTextStyles.label),
          const SizedBox(height: 6),
          TextField(
            controller: _amountCtrl,
            keyboardType:
                const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]'))
            ],
            style: AppTextStyles.h3,
            decoration: InputDecoration(
              prefixText: '\$ ',
              hintText: '0.00',
              hintStyle:
                  AppTextStyles.h3.copyWith(color: AppColors.gray300),
              filled: true,
              fillColor: AppColors.gray50,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            ),
          ),
          const SizedBox(height: 4),
          Text('Mínimo \$5.00 · Máximo \$500.00',
              style: AppTextStyles.caption),
          const SizedBox(height: 16),
          Text('Comprobante de transferencia', style: AppTextStyles.label),
          const SizedBox(height: 6),
          GestureDetector(
            onTap: _pickImage,
            child: Container(
              height: 76,
              decoration: BoxDecoration(
                color: AppColors.gray50,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: _proof != null
                      ? AppColors.primary
                      : AppColors.gray200,
                  width: 1.5,
                ),
              ),
              child: _proof == null
                  ? Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.upload_file_outlined,
                            color: AppColors.gray400),
                        const SizedBox(height: 4),
                        Text('Toca para adjuntar imagen',
                            style: AppTextStyles.caption),
                      ],
                    )
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const Icon(Icons.check_circle,
                            color: AppColors.primary, size: 20),
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            _proof!.name,
                            style: AppTextStyles.label,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 8),
                        GestureDetector(
                          onTap: () => setState(() => _proof = null),
                          child: const Icon(Icons.close,
                              size: 16, color: AppColors.gray400),
                        ),
                      ],
                    ),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _notesCtrl,
            maxLines: 2,
            decoration: InputDecoration(
              hintText: 'Nota opcional (referencia del pago, titular…)',
              hintStyle:
                  AppTextStyles.body.copyWith(color: AppColors.gray400),
              filled: true,
              fillColor: AppColors.gray50,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
              contentPadding: const EdgeInsets.all(14),
            ),
          ),
          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: AppColors.secondary,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14)),
                elevation: 0,
                textStyle: AppTextStyles.btn,
              ),
              onPressed: _loading ? null : _submit,
              child: _loading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: AppColors.secondary),
                    )
                  : const Text('Enviar solicitud'),
            ),
          ),
        ],
      ),
    );
  }
}

// ── Success dialog ────────────────────────────────────────────────────────────

void _showConfirmationDialog(BuildContext context) {
  showDialog(
    context: context,
    useRootNavigator: true,
    barrierDismissible: false,
    builder: (dialogCtx) => AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      contentPadding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              color: AppColors.successLight,
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.check_rounded, color: AppColors.success, size: 36),
          ),
          const SizedBox(height: 16),
          Text('¡Solicitud enviada!',
              style: AppTextStyles.h3, textAlign: TextAlign.center),
          const SizedBox(height: 8),
          Text(
            'Tu recarga está siendo verificada.\nEn un máximo de 1 hora tendrás la aprobación.',
            style: AppTextStyles.body.copyWith(color: AppColors.gray500),
            textAlign: TextAlign.center,
          ),
        ],
      ),
      actions: [
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: AppColors.secondary,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              elevation: 0,
            ),
            onPressed: () => Navigator.of(dialogCtx, rootNavigator: true).pop(),
            child: const Text('Entendido'),
          ),
        ),
      ],
    ),
  );
}

// ── Bank account card ─────────────────────────────────────────────────────────

class _BankCard extends StatelessWidget {
  const _BankCard({required this.bank, required this.onSelect});
  final BankAccountModel bank;
  final VoidCallback onSelect;

  @override
  Widget build(BuildContext context) {
    final bankInfo = getBankInfo(bank.bankName);
    return Container(
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.gray200),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              _BankLogo(bankInfo: bankInfo, logoUrl: bank.logoUrl),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(bank.bankName, style: AppTextStyles.labelLg),
                      Text(bank.accountTypeLabel,
                          style: AppTextStyles.caption),
                    ]),
              ),
            ]),
            const SizedBox(height: 12),
            _InfoRow(label: 'Titular', value: bank.accountHolder),
            _InfoRow(
                label: 'No. de cuenta',
                value: bank.accountNumber,
                copyable: true),
            if (bank.idNumber != null)
              _InfoRow(label: 'RUC / CI', value: bank.idNumber!),
            if (bank.notes != null && bank.notes!.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(bank.notes!,
                  style: AppTextStyles.caption
                      .copyWith(color: AppColors.gray500)),
            ],
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.secondary,
                  foregroundColor: AppColors.white,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10)),
                  elevation: 0,
                  textStyle: AppTextStyles.btn,
                ),
                onPressed: onSelect,
                child: const Text('Seleccionar esta cuenta'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow(
      {required this.label, required this.value, this.copyable = false});
  final String label;
  final String value;
  final bool copyable;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(children: [
        Text('$label: ', style: AppTextStyles.caption),
        Expanded(child: Text(value, style: AppTextStyles.label)),
        if (copyable)
          GestureDetector(
            onTap: () {
              Clipboard.setData(ClipboardData(text: value));
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('Número copiado'),
                  duration: Duration(seconds: 1),
                  behavior: SnackBarBehavior.floating,
                ),
              );
            },
            child: const Padding(
              padding: EdgeInsets.only(left: 6),
              child: Icon(Icons.copy_outlined,
                  size: 14, color: AppColors.gray400),
            ),
          ),
      ]),
    );
  }
}
