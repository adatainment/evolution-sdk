use aiken/collection/dict
use aiken/collection/list
use aiken/primitive/int
use cardano/address.{Script}
use cardano/assets
use cardano/transaction.{InlineDatum, OutputReference, Transaction, find_input}

/// Datum stored in UTxO - a base counter value
pub type CounterDatum {
  counter: Int,
}

/// Spend redeemer: must be datum.counter + own_index
pub type SpendRedeemer {
  value: Int,
}

/// Mint redeemer: list of (index, value) pairs for all script inputs
pub type MintRedeemer {
  entries: List<(Int, Int)>,
}

validator mint_multi_validator {
  spend(
    datum_opt: Option<CounterDatum>,
    redeemer: SpendRedeemer,
    own_ref: OutputReference,
    self: Transaction,
  ) {
    // Require inline datum
    expect Some(datum) = datum_opt

    // Find the index of our own input in the transaction's inputs
    let own_index_in_list =
      list.index_of(
        list.map(self.inputs, fn(i) { i.output_reference }),
        own_ref,
      )

    expect Some(own_idx) = own_index_in_list

    // DATUM + INDEX CHECK: redeemer.value must equal datum.counter + own_index
    let expected_value = datum.counter + own_idx
    let redeemer_is_valid = redeemer.value == expected_value

    // Get our script hash
    expect Some(input) = find_input(self.inputs, own_ref)
    expect Script(script_hash) = input.output.address.payment_credential

    // Verify we're minting (not empty mint for this policy)
    let is_empty =
      self.mint
        |> assets.tokens(script_hash)
        |> dict.is_empty
    let not_empty_mint = !is_empty

    and {
      redeemer_is_valid?,
      not_empty_mint?,
    }
  }

  mint(redeemer: MintRedeemer, policy_id: ByteArray, self: Transaction) {
    // Batch redeemer pattern: redeemer.entries must contain (index, value) for ALL script inputs
    // Each entry must have value == datum.counter + index
    // Get all script inputs with their indices
    let script_inputs_with_idx =
      self.inputs
        |> list.indexed_map(fn(idx, input) { (idx, input) })
        |> list.filter(
            fn(pair) {
              let (_, input) = pair
              when input.output.address.payment_credential is {
                Script(hash) -> hash == policy_id
                _ -> False
              }
            },
          )

    // Verify each script input has a matching entry in redeemer
    let all_valid =
      list.all(
        script_inputs_with_idx,
        fn(pair) {
          let (idx, input) = pair
          // Get inline datum from the input
          expect InlineDatum(datum_data) = input.output.datum
          expect datum: CounterDatum = datum_data
          // Expected value = datum.counter + index
          let expected_value = datum.counter + idx
          // Check redeemer has this (index, value) pair
          list.any(
            redeemer.entries,
            fn(entry) { entry == (idx, expected_value) },
          )
        },
      )

    // Also verify redeemer length matches script input count (no extra entries)
    let correct_length =
      list.length(redeemer.entries) == list.length(script_inputs_with_idx)

    all_valid && correct_length
  }

  else(_) {
    fail
  }
}
