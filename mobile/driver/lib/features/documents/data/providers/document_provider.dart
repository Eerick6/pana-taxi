import 'dart:io';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/document_model.dart';
import '../repositories/document_repository.dart';

// autoDispose: se libera al salir de DocumentsPage / PendingApprovalScreen
final documentsProvider =
    AsyncNotifierProvider.autoDispose<DocumentsNotifier, List<DocumentModel>>(
  DocumentsNotifier.new,
);

class DocumentsNotifier extends AutoDisposeAsyncNotifier<List<DocumentModel>> {
  @override
  Future<List<DocumentModel>> build() =>
      ref.read(documentRepositoryProvider).getDocuments();

  Future<void> upload(String type, File file) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(
      () => ref.read(documentRepositoryProvider).uploadDocument(type, file),
    );
  }
}
