use aiken/cbor
use aiken/collection/list
use aiken/collection/pairs
use cardano/address.{Credential}
use cardano/certificate.{Certificate}
use cardano/transaction.{Output, OutputReference, Transaction}

/// Redeemer for withdraw: list of input indices being coordinated
pub type WithdrawRedeemer {
  input_indices: List<Int>,
}

/// Redeemer for publish (certificates): allows any action
/// Could be extended to restrict certain operations
pub type PublishRedeemer {
  /// Placeholder - certificates always allowed for this validator
  placeholder: Int,
}

validator stake_multivalidator {
  spend(_datum, redeemer: Int, own_ref: OutputReference, self: Transaction) {
    expect Some(input) = list.at(self.inputs, redeemer)
    and {
      (input.output_reference == own_ref)?,
      pairs.has_key(self.withdrawals, input.output.address.payment_credential),
    }
  }

  withdraw(
    redeemer: WithdrawRedeemer,
    own_credential: Credential,
    self: Transaction,
  ) {
    // Ensure no duplicate indices in redeemer (prevents [1,1] value extraction attack)
    let unique_indices = list.unique(redeemer.input_indices)
    let no_duplicates =
      list.length(unique_indices) == list.length(redeemer.input_indices)

    // Validate each input index in the redeemer points to a script-owned input
    let valid_inputs =
      list.all(
        redeemer.input_indices,
        fn(idx) {
          expect Some(input) = list.at(self.inputs, idx)
          input.output.address.payment_credential == own_credential
        },
      )

    // Count outputs going back to the script
    let output_count =
      list.foldl(
        self.outputs,
        0,
        fn(output, acc) {
          if output.address.payment_credential == own_credential {
            acc + 1
          } else {
            acc
          }
        },
      )

    let input_count = list.length(redeemer.input_indices)

    trace cbor.diagnostic(input_count)
    trace cbor.diagnostic(output_count)
    and {
      no_duplicates?,
      valid_inputs?,
      (input_count == output_count)?,
    }
  }

  /// Publish handler for certificate operations (register, delegate, deregister)
  /// In this validator, certificates are always allowed - the real validation
  /// happens in the spend+withdraw coordination pattern
  publish(
    _redeemer: PublishRedeemer,
    _own_credential: Credential,
    _certificate: Certificate,
  ) {
    // Always succeed for certificate operations
    // The coordination pattern validates via spend+withdraw
    True
  }

  else(_) {
    fail
  }
}
