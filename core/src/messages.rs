//! Star Central's messages (ONTOLOGY "Star Central messages", D-46).
//!
//! Each kind of message is a row of `MESSAGE_TABLE`: a key, the placeholders its wordings carry
//! as `{name}`, and exactly `WORDINGS_PER_KIND` wordings. A wording is a whole message; code
//! only picks one and fills its placeholders, and never builds a sentence. The pick is made from
//! a number the caller of `compose` supplies, so no message draws from a game's random stream.

use crate::counters::CounterRow;

pub const WORDINGS_PER_KIND: usize = 20;

/// A lifetime total of a positive counter reached a rung.
pub const LIFETIME_COMMENDATION: &str = "lifetime_commendation";
/// A lifetime total of a negative counter reached a rung.
pub const LIFETIME_NOTORIETY: &str = "lifetime_notoriety";

/// A goal of the game was met (D-48).
pub const OBJECTIVE_MET: &str = "objective_met";

pub struct MessageKind {
    pub key: &'static str,
    /// The names every wording of this kind carries, each written `{name}` in the wording.
    pub placeholders: &'static [&'static str],
    pub wordings: [&'static str; WORDINGS_PER_KIND],
}

/// `{label}` is a counter's label and `{amount}` the amount reached on it: a rung of its lifetime
/// total, or a goal's amount. A label is plural and lower case, so every wording names the label
/// as a heading of the record and gives the amount apart from it: it reads right for an amount
/// of 1 and never starts a sentence.
const COUNTER_PLACEHOLDERS: [&str; 2] = ["amount", "label"];

pub const MESSAGE_TABLE: [MessageKind; 3] = [
    MessageKind {
        key: LIFETIME_COMMENDATION,
        placeholders: &COUNTER_PLACEHOLDERS,
        wordings: [
            "Star Central to captain: commendation. Your lifetime tally of {label} has reached {amount}.",
            "Star Central: entered in the fleet record this stardate, {label}: {amount}. Well done, captain.",
            "Star Central: the Admiralty notes with approval that your count of {label} now stands at {amount}.",
            "Star Central: signal from the flag. Career total of {label}: {amount}. Splice the mainbrace.",
            "Star Central to all hands: your captain's record now shows {label}: {amount}. Fleet Command is pleased.",
            "Star Central: commendation, captain. {amount} is the new mark in your log under {label}.",
            "Star Central: the fleet ledger has turned a page for you. It now reads {label}: {amount}, every one of them earned.",
            "Star Central: Fleet Command sends its compliments. Tally of {label} to date: {amount}.",
            "Star Central: a mention in dispatches, captain. Career count of {label}: {amount}.",
            "Star Central: the Raxxon keep a ledger too, and your page in it reads {label}: {amount}. They do not enjoy the reading.",
            "Star Central: Bravo Zulu, captain. Service record updated with {label}: {amount}.",
            "Star Central: the watch officer has rung the bell for you. Lifetime total of {label}: {amount}.",
            "Star Central: your name came up at the Admiralty table today. The reason given was {label}: {amount}.",
            "Star Central: commendation logged. With {label} at {amount}, the cadets are studying your patrols.",
            "Star Central: hoist the pennant. Your running total of {label} has reached {amount}.",
            "Star Central: steady work, captain. The count of {label} on your record is now {amount}.",
            "Star Central: the Fleet Admiral asked who was responsible for {label} reaching {amount}. We gave your name, with pride.",
            "Star Central: one for the wardroom wall, signed and countersigned. It reads {label}: {amount}.",
            "Star Central: the galaxy is a little safer tonight. Your career mark for {label} stands at {amount}.",
            "Star Central: your orders are unchanged, captain, but our regard is not. On your record, {label}: {amount}. Carry on.",
        ],
    },
    MessageKind {
        key: LIFETIME_NOTORIETY,
        placeholders: &COUNTER_PLACEHOLDERS,
        wordings: [
            "Star Central to captain: this is not a commendation. Your lifetime tally of {label} has reached {amount}.",
            "Star Central: the fleet record, regrettably, is thorough. Entered this stardate, {label}: {amount}.",
            "Star Central: the quartermaster asks us to pass on that your count of {label} now stands at {amount}. He did not smile.",
            "Star Central: a milestone of sorts, captain. Career total of {label}: {amount}. The shipwrights send their regards.",
            "Star Central: the Admiralty has noticed your record under {label}. It reads {amount}. A word in private is suggested.",
            "Star Central: congratulations are not quite the word. Tally of {label} to date: {amount}.",
            "Star Central: the Raxxon have sent a note of thanks. Your running total of {label} has reached {amount}.",
            "Star Central: for the log, and against our better judgment, {label}: {amount}.",
            "Star Central: the academy would like you as a case study. The chapter is titled {label}, and the figure in it is {amount}.",
            "Star Central: the insurance board asks us to confirm a figure. Is {amount} correct for {label}? We fear it is.",
            "Star Central: distinction comes in many forms, captain. Yours today is {label}: {amount}.",
            "Star Central: the repair yards have named a dry dock after you. Lifetime count of {label}: {amount}.",
            "Star Central: no medal is struck for this, but the record stands. Career mark for {label}: {amount}.",
            "Star Central: the Fleet Admiral asked who was responsible for {label} reaching {amount}. We gave your name, with a sigh.",
            "Star Central: character is built in adversity, captain, and you have built a great deal. Count of {label}: {amount}.",
            "Star Central: the chaplain is praying for your ship. He cites your total of {label}, now {amount}.",
            "Star Central: a wry salute from the flag bridge. With {label} at {amount}, you are at least consistent.",
            "Star Central: the wardroom betting pool has paid out. Your tally of {label} has reached {amount}.",
            "Star Central: still in command, captain, and that counts for something. On the ledger, {label}: {amount}.",
            "Star Central: Fleet Command reminds you that the ship is on loan. Your record of {label} has reached {amount}.",
        ],
    },
    MessageKind {
        key: OBJECTIVE_MET,
        placeholders: &COUNTER_PLACEHOLDERS,
        wordings: [
            "Star Central to captain: objective met. This patrol's orders called for {label}: {amount}, and you have delivered.",
            "Star Central: strike one objective from your orders. Under {label}, the required {amount} is confirmed.",
            "Star Central: signal received and understood. Patrol objective achieved, {label}: {amount}. Well done.",
            "Star Central: the operations board shows a green light beside {label}. Target of {amount} reached on this patrol.",
            "Star Central: Bravo Zulu. We asked this patrol for {label} to the number of {amount}, and you have answered.",
            "Star Central: objective complete, captain. The target for {label} was {amount}, and your log shows it met.",
            "Star Central: Fleet Command set you a mark of {amount} under {label} for this patrol. Mark made. Carry on.",
            "Star Central: the duty officer has ticked a box with some satisfaction. Patrol objective, {label}: {amount}, is done.",
            "Star Central: your orders listed {label}: {amount}. Consider that line of them discharged, with our thanks.",
            "Star Central: the Raxxon will not care to hear it, but this patrol's objective of {amount} under {label} is met.",
            "Star Central to all hands: your captain has met a patrol objective. On the board, {label}: {amount}. An extra ration tonight.",
            "Star Central: one objective down, captain. Your orders read {label}: {amount}, and the clerks have stamped that line complete.",
            "Star Central: the Admiral's staff wagered you would not reach {amount} under {label} on this patrol. The staff is buying.",
            "Star Central: mission tally checked against your orders. Required for {label}: {amount}. Achieved, and noted.",
            "Star Central: that is how a patrol is run, captain. Objective for {label} reached at {amount}.",
            "Star Central: the plotting room has moved your marker forward. Patrol target of {amount} for {label} is met.",
            "Star Central: orders are easier written than carried out, and you carried these out. Objective met, {label}: {amount}.",
            "Star Central: your yeoman may enter it in the log. This patrol's objective, {label}: {amount}, achieved this stardate.",
            "Star Central: a clean piece of work. Fleet Command asked this patrol for {amount} under {label} and has received it.",
            "Star Central: objective achieved, captain. With {label} at the ordered {amount}, the flag sends its compliments.",
        ],
    },
];

pub fn message_kind(key: &str) -> Option<&'static MessageKind> {
    MESSAGE_TABLE.iter().find(|kind| kind.key == key)
}

/// One message of `kind`: the wording `roll` picks, with each placeholder replaced by its
/// value. `roll` is uniform in [0, 1) and supplied by the caller; the same roll picks the same
/// wording. None when the kind is unknown or `values` lacks one of its placeholders.
pub fn compose(kind: &str, roll: f64, values: &[(&str, &str)]) -> Option<String> {
    let kind = message_kind(kind)?;
    let wording = kind.wordings[wording_index(roll)];
    kind.placeholders.iter().try_fold(wording.to_string(), |text, name| {
        let (_, value) = values.iter().find(|(given, _)| given == name)?;
        Some(text.replace(&format!("{{{name}}}"), value))
    })
}

/// A roll at or past 1 picks the last wording, and one below 0 the first.
fn wording_index(roll: f64) -> usize {
    ((roll * WORDINGS_PER_KIND as f64) as usize).min(WORDINGS_PER_KIND - 1)
}

/// The kind that announces a rung of this counter's lifetime total: a commendation for a
/// positive counter, notoriety for a negative one. The one place that choice is made.
pub fn lifetime_kind(row: &CounterRow) -> &'static str {
    match row.may_be_goal {
        true => LIFETIME_COMMENDATION,
        false => LIFETIME_NOTORIETY,
    }
}

/// A message of a kind that takes a counter's label and an amount.
fn counter_message(kind: &str, row: &CounterRow, amount: u64, roll: f64) -> String {
    let amount = amount.to_string();
    compose(kind, roll, &[("amount", &amount), ("label", row.label)]).expect("the kind takes an amount and a label")
}

/// Star Central's message for the counter's lifetime total reaching the rung `amount`.
pub fn lifetime_message(row: &CounterRow, amount: u64, roll: f64) -> String {
    counter_message(lifetime_kind(row), row, amount, roll)
}

/// Star Central's message for a game's goal of `amount` on the counter being met.
pub fn objective_message(row: &CounterRow, amount: u64, roll: f64) -> String {
    counter_message(OBJECTIVE_MET, row, amount, roll)
}
