import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/network/dio_client.dart';
import '../models/wallet_model.dart';

final walletRepositoryProvider = Provider<WalletRepository>((ref) {
  return WalletRepository(ref.read(dioProvider));
});

class WalletRepository {
  WalletRepository(this._dio);
  final Dio _dio;

  Future<WalletModel> getWallet() async {
    final res = await _dio.get('/wallet/me');
    return WalletModel.fromJson(res.data as Map<String, dynamic>);
  }

  Future<List<TransactionModel>> getTransactions({int page = 1}) async {
    final res = await _dio.get('/wallet/me/transactions',
        queryParameters: {'page': page, 'limit': 20});
    final data = res.data;
    final items =
        (data is List ? data : (data['items'] ?? data['data'] ?? [])) as List;
    return items
        .map((e) => TransactionModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<BankAccountModel>> getBankAccounts() async {
    final res = await _dio.get('/wallet/bank-accounts');
    final data = res.data as List;
    return data
        .map((e) => BankAccountModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<RechargeModel>> getMyRecharges({int page = 1}) async {
    final res = await _dio.get('/wallet/me/recharges',
        queryParameters: {'page': page, 'limit': 20});
    final data = res.data;
    final items =
        (data is List ? data : (data['items'] ?? data['data'] ?? [])) as List;
    return items
        .map((e) => RechargeModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> requestRecharge({
    required double amount,
    required String bankAccountId,
    required String filePath,
    required String mimeType,
    String? driverNotes,
  }) async {
    final formData = FormData.fromMap({
      'amount': amount.toStringAsFixed(2),
      'method': 'bank_transfer',
      'bank_account_id': bankAccountId,
      if (driverNotes != null && driverNotes.isNotEmpty) 'driver_notes': driverNotes,
      'proof': await MultipartFile.fromFile(
        filePath,
        contentType: DioMediaType.parse(mimeType),
      ),
    });
    await _dio.post(
      '/wallet/me/recharges',
      data: formData,
      options: Options(contentType: 'multipart/form-data'),
    );
  }
}
