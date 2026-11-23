# The book and its settings: how they connect (S1 part 1, rev 16)

A plain guide to the 3 new tables, with one example row each, one scenario, and every link explained.
Values are the test's (`t24_schema_test.sql`); ids are shortened (`BOOK-1` stands for a uuid). **Aikyat's real values are the CA's decision (G3); these are illustrative.**

---

## 1. The idea in one picture

```
 pc.party                    "Aikyat Biscuits Pvt Ltd" (who the company is: P&C)
    │
 pc.operated_party           OP-1  "the company we keep books for"
    │ 1
    │ has 1..n
 fin.book                    BOOK-1  PRIMARY book
    │ 1
    │ has n (dated)
 fin.book_setting            costing_method = fifo   from 01-Apr-2026
    │                        inventory_mode = perpetual from 01-Apr-2026
    │ n
    │ must be one of
 fin.setting_definition      costing_method: {fifo, weighted_average}
                             inventory_mode: {perpetual, periodic}

 fin.sales_invoice (T24)     reads the setting in force on its invoice date → stamps it → posts the cost
```

| Question | Answered by |
|---|---|
| **Whose** books? | `pc.operated_party` (the company) |
| **Which** book? | `fin.book` (primary today; an IFRS book later) |
| **What settings may a book have?** | `fin.setting_definition` (the menu) |
| **What did this book choose, and from when?** | `fin.book_setting` (the choice, dated) |

---

## 2. The 3 tables, one row each

### ① `fin.setting_definition`: the menu (what can be set)

| setting_code | display_name | allowed_values | owner_task | read_by |
|---|---|---|---|---|
| `costing_method` | Costing method | `{fifo, weighted_average}` | S1 part 1 (for T24); S4 owns it | T24 rule R13, T9 |

- One row per **kind** of setting. The 2nd row today is `inventory_mode` with `{perpetual, periodic}`.
- **No company, no book here:** it is the same menu for everyone, like the GST state codes.
- **A new setting later** (e.g. `fx_rate_source` for T23) is a new **row**, not a new column.

### ② `fin.book`: the book (whose books)

| book_id | workspace_id | operated_party_id | book_code | display_name | is_primary |
|---|---|---|---|---|---|
| `BOOK-1` | aikyat-biscuits | `OP-1` (Aikyat Biscuits) | PRIMARY | Aikyat Biscuits · primary book | true |

- One company can have more books later (e.g. `IFRS`). **Only one is primary** (a unique key refuses a second).
- **Why a book and not the company directly?** If settings hung on the company, a 2nd book would force us to move them. Hung on the book, nothing moves.

### ③ `fin.book_setting`: the choice (what this book uses, from when)

| book_setting_id | book_id | setting_code | setting_value | effective_from | effective_until | reason | approved_by_contact_id | approved_at |
|---|---|---|---|---|---|---|---|---|
| `BS-1` | `BOOK-1` | `costing_method` | fifo | 01-Apr-2026 | *(empty = in force)* | First setting | `C-2` (Rajan) | 01-Apr-2026 10:00 |

- `book_id` → **which book** (BOOK-1).
- `setting_code` → **which menu item** (must exist in ①).
- `setting_value` → **the choice** (must be in ①'s `allowed_values`; LIFO is refused).
- `effective_from` / `effective_until` → **when it applies**. Two values can never overlap on the same day.
- `approved_by_contact_id` → **who approved it** (a person in `pc.contact`). See §5.

---

## 3. Every link, and why

| From | To | Kind | Why |
|---|---|---|---|
| `fin.book.operated_party_id` | `pc.operated_party` | Foreign key | A book belongs to a company we run. A made-up company is refused |
| `fin.book_setting.book_id` | `fin.book` | Foreign key | A setting belongs to one book |
| `fin.book_setting.setting_code` | `fin.setting_definition` | Foreign key | Only settings on the menu |
| `fin.book_setting.setting_value` | `setting_definition.allowed_values` | Trigger (a CHECK cannot read another table) | Only allowed values: no LIFO |
| `fin.book_setting.approved_by_contact_id` | `pc.contact` | Foreign key | Who approved the policy (see §5) |
| `fin.sales_invoice` | (no foreign key) | **Reads + copies** | The voucher copies `inventory_mode` and `costing_method` as used, so it is explained forever even if the setting changes |

---

## 4. Scenario: Aikyat, from installation to a policy change

| # | Date | What happens | Rows touched |
|---|---|---|---|
| 1 | Go-live | **Installation.** Aikyat's primary book is created; the 2 settings are chosen | `book` BOOK-1 · `book_setting` BS-1 (fifo), BS-2 (perpetual) |
| 2 | 07-Oct-2026 | **B4-01:** Billing's invoice KA/INV/2627/0143 is booked (SV-0012). The rule asks: "on 07-Oct, what does BOOK-1 use?" → **perpetual + FIFO** | `sales_invoice` SV-0012: `inventory_mode = perpetual`, `costing_method = fifo` |
| 3 | 07-Oct-2026 | Because perpetual: the cost is posted in the **same** entry. Because FIFO: the oldest lots first | Journal: Dr 501040 Cost of Goods Sold ₹5,58,000 · Cr 106020 Finished Goods (3 lots) |
| 4 | 01-Apr-2027 | **Policy change:** FIFO → weighted average. BS-1 is **closed** (until = 01-Apr-2027), never edited; a new row is added | `book_setting` BS-1 until 01-Apr-2027 · **BS-3** weighted_average from 01-Apr-2027 |
| 5 | 01-May-2027 | A new sale reads **weighted average**. SV-0012 still shows **fifo**: it was stamped | New voucher: `costing_method = weighted_average` |
| — | If periodic | Had BOOK-1 chosen `periodic`: the voucher has **no cost lines** and no method; T11 posts the month's cost | `sales_invoice`: `inventory_mode = periodic`, `costing_method` empty |

**What the rule reads (in one line):** the company's primary book → its `book_setting` row for that setting where `effective_from ≤ invoice date < effective_until`.

---

## 5. The contact link: open decision

- **Today:** `approved_by_contact_id` → `pc.contact` records who approved each setting row (BS-1: Rajan).
- **Your point (23-Nov):** setup is a **one-time installation**, not the Accounts Executive's daily work.
- **Proposed:** remove `approved_by_contact_id` and `approved_at` now:
  - T24 only reads the setting;
  - the approval trail matters when a setting is **changed** after go-live (step 4: Ind AS 8);
  - add it back with that change task (logged as a gap).
- **Waiting for your yes.**

---

## 6. What is not here yet (comes with its task)

| Later need | Added where | By |
|---|---|---|
| Base currency | `fin.book.base_currency` | T23 FX revaluation |
| Ind AS / AS / IFRS | `fin.book.framework` | A 2nd book (G4) |
| Books-from, go-live dates | `fin.book` | G2 |
| Journal entry per book | `fin.journal_entry.book_id` | To agree with Manoj (G39) |
| Other settings (FX rate source, AATO band, month close) | New rows in `fin.setting_definition` | T23, G17, G27 |
