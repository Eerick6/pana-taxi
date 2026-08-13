import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../../../../core/network/dio_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';

class PayphoneWebViewPage extends ConsumerStatefulWidget {
  const PayphoneWebViewPage({super.key, required this.tripId, required this.amount});
  final String tripId;
  final double amount;

  @override
  ConsumerState<PayphoneWebViewPage> createState() => _PayphoneWebViewPageState();
}

class _PayphoneWebViewPageState extends ConsumerState<PayphoneWebViewPage> {
  WebViewController? _ctrl;
  bool _loadingUrl  = true;
  bool _confirming  = false;
  String? _error;
  double? _feeAmount;
  double? _chargedAmount;

  @override
  void initState() {
    super.initState();
    _fetchAndLoad();
  }

  Future<void> _fetchAndLoad() async {
    try {
      final dio = ref.read(dioProvider);
      final res = await dio.post('/payphone/link', data: {'trip_id': widget.tripId});
      final url = res.data['url'] as String;
      final feeAmount = double.tryParse(res.data['card_fee_amount']?.toString() ?? '');
      final chargedAmount = double.tryParse(res.data['card_charged_amount']?.toString() ?? '');

      final ctrl = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..setNavigationDelegate(NavigationDelegate(
          onPageFinished: (_) => setState(() => _loadingUrl = false),
          onNavigationRequest: _onNavRequest,
          onWebResourceError: (e) {
            if (mounted) setState(() => _error = 'Error al cargar: ${e.description}');
          },
        ))
        ..loadRequest(Uri.parse(url));

      if (mounted) {
        setState(() {
          _ctrl = ctrl;
          _feeAmount = feeAmount;
          _chargedAmount = chargedAmount;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _error = 'No se pudo generar el pago: $e');
    }
  }

  NavigationDecision _onNavRequest(NavigationRequest req) {
    if (req.url.contains('/payphone/callback')) {
      final uri = Uri.tryParse(req.url);
      if (uri != null) _handleCallback(uri);
      return NavigationDecision.prevent;
    }
    return NavigationDecision.navigate;
  }

  Future<void> _handleCallback(Uri uri) async {
    final cancelled = uri.queryParameters['cancelled'] == '1';
    if (cancelled) {
      if (mounted) context.pop();
      return;
    }

    final idStr    = uri.queryParameters['id'];
    final clientTx = uri.queryParameters['clientTransactionId'];
    // Solo presente si Payphone tiene tokenización aprobada para la cuenta —
    // si no, este parámetro simplemente no llega y no pasa nada.
    final cardToken = uri.queryParameters['ctoken'];
    if (idStr == null || clientTx == null) {
      if (mounted) context.pop();
      return;
    }

    setState(() => _confirming = true);
    try {
      final dio = ref.read(dioProvider);
      final res = await dio.post('/payphone/confirm', data: {
        'payphone_id':  int.parse(idStr),
        'client_tx_id': clientTx,
        'trip_id':      widget.tripId,
        if (cardToken != null && cardToken.isNotEmpty) 'card_token': cardToken,
      });
      final success = res.data['success'] as bool? ?? false;
      if (!mounted) return;
      if (success) {
        _showResult(true);
      } else {
        _showResult(false);
      }
    } catch (_) {
      if (mounted) _showResult(false);
    } finally {
      if (mounted) setState(() => _confirming = false);
    }
  }

  void _showResult(bool success) {
    showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        title: Text(success ? 'Pago exitoso' : 'Pago fallido'),
        content: Text(
          success
              ? 'Tu pago de \$${(_chargedAmount ?? widget.amount).toStringAsFixed(2)} '
                  '(tarifa \$${widget.amount.toStringAsFixed(2)} + recargo tarjeta '
                  '\$${(_feeAmount ?? 0).toStringAsFixed(2)}) fue procesado correctamente.'
              : 'No se pudo procesar el pago. Puedes intentar de nuevo o pagar en efectivo.',
        ),
        actions: [
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              context.go('/home');
            },
            child: const Text('Continuar'),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Pago con tarjeta', style: AppTextStyles.h3),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => context.pop(),
        ),
      ),
      body: Column(
        children: [
          if (_feeAmount != null && _chargedAmount != null)
            _FeeBreakdown(
              fare: widget.amount,
              fee: _feeAmount!,
              total: _chargedAmount!,
            ),
          Expanded(child: _buildBody()),
        ],
      ),
    );
  }

  Widget _buildBody() {
    return Stack(
        children: [
          if (_error != null)
            Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline, size: 48, color: AppColors.error),
                    const SizedBox(height: 16),
                    Text(_error!, style: AppTextStyles.body, textAlign: TextAlign.center),
                    const SizedBox(height: 24),
                    ElevatedButton(
                      onPressed: () {
                        setState(() { _error = null; _loadingUrl = true; });
                        _fetchAndLoad();
                      },
                      child: const Text('Reintentar'),
                    ),
                  ],
                ),
              ),
            )
          else if (_ctrl != null)
            WebViewWidget(controller: _ctrl!)
          else
            const Center(child: CircularProgressIndicator()),

          if (_loadingUrl && _ctrl != null)
            const Center(child: CircularProgressIndicator()),

          if (_confirming)
            Container(
              color: Colors.black45,
              child: Center(
                child: Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: AppColors.white,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const CircularProgressIndicator(),
                      const SizedBox(height: 16),
                      Text('Confirmando pago...', style: AppTextStyles.body),
                    ],
                  ),
                ),
              ),
            ),
        ],
    );
  }
}

class _FeeBreakdown extends StatelessWidget {
  const _FeeBreakdown({required this.fare, required this.fee, required this.total});
  final double fare;
  final double fee;
  final double total;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
        decoration: const BoxDecoration(
          color: Color(0xFFF8FAFC),
          border: Border(bottom: BorderSide(color: AppColors.gray100)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _row('Tarifa del viaje', fare, style: AppTextStyles.body),
            const SizedBox(height: 2),
            _row('Recargo por tarjeta (uso de pasarela + IVA)', fee,
                style: AppTextStyles.caption.copyWith(color: AppColors.gray500)),
            const Divider(height: 14),
            _row('Total a cobrar', total,
                style: AppTextStyles.label.copyWith(fontWeight: FontWeight.bold)),
          ],
        ),
      );

  Widget _row(String label, double amount, {required TextStyle style}) => Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(child: Text(label, style: style)),
          Text('\$${amount.toStringAsFixed(2)}', style: style),
        ],
      );
}
