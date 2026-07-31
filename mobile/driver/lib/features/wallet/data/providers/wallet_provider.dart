import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/wallet_model.dart';
import '../repositories/wallet_repository.dart';

// Todos los providers de wallet son autoDispose — solo se usan en WalletPage

final walletProvider =
    AsyncNotifierProvider.autoDispose<WalletNotifier, WalletModel>(
  WalletNotifier.new,
);

class WalletNotifier extends AutoDisposeAsyncNotifier<WalletModel> {
  @override
  Future<WalletModel> build() =>
      ref.read(walletRepositoryProvider).getWallet();

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
        () => ref.read(walletRepositoryProvider).getWallet());
  }
}

final transactionsProvider =
    AsyncNotifierProvider.autoDispose<TransactionsNotifier, List<TransactionModel>>(
  TransactionsNotifier.new,
);

class TransactionsNotifier
    extends AutoDisposeAsyncNotifier<List<TransactionModel>> {
  @override
  Future<List<TransactionModel>> build() =>
      ref.read(walletRepositoryProvider).getTransactions();
}

final bankAccountsProvider =
    AsyncNotifierProvider.autoDispose<BankAccountsNotifier, List<BankAccountModel>>(
  BankAccountsNotifier.new,
);

class BankAccountsNotifier
    extends AutoDisposeAsyncNotifier<List<BankAccountModel>> {
  @override
  Future<List<BankAccountModel>> build() =>
      ref.read(walletRepositoryProvider).getBankAccounts();
}

final myRechargesProvider =
    AsyncNotifierProvider.autoDispose<MyRechargesNotifier, List<RechargeModel>>(
  MyRechargesNotifier.new,
);

class MyRechargesNotifier extends AutoDisposeAsyncNotifier<List<RechargeModel>> {
  @override
  Future<List<RechargeModel>> build() =>
      ref.read(walletRepositoryProvider).getMyRecharges();

  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
        () => ref.read(walletRepositoryProvider).getMyRecharges());
  }
}
