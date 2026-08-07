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

      if (mounted) setState(() => _ctrl = ctrl);
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
              ? 'Tu pago de \$${widget.amount.toStringAsFixed(2)} fue procesado correctamente.'
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
      body: Stack(
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
      ),
    );
  }
}
