use cardano/transaction.{OutputReference, Transaction}

validator always_succeed {
  spend(
    _datum: Option<Data>,
    _redeemer: Data,
    _utxo: OutputReference,
    _self: Transaction,
  ) {
    True
  }

  else(_) {
    False
  }
}
