# External synthetic PDF statements

Source: github.com/AyonPal/bank-statement-pdf-parser (MIT License). Fictional Indian banks, synthetic data, no real account holders.

What makes them hard for the parser:
- Letter-spaced headers ("D AT E", "S TAT E M E N T P E R I O D") must still be recognised
- Meridian: the description line sits ABOVE the date line of the same transaction
- Astra: "CR" for the balance is on the next line
- Sub-lines "VPA ...", "UTR ...", "REF ..." belong to the transaction above and are not merchants
- Merchant follows "UPI/DR/", "NEFT/DR/", "ACH/DR/"; "/CR/" rows are money in
- Indian digit grouping (1,21,500.00 style and 121,500.00), INR, DD-MM-YYYY
- Multi-page with repeated headers (Northstar 3 pages)
- Account holder name and masked account number (XXXXXX4821) must be redacted

Expected: Adobe Creative Cloud (Northstar, monthly) found as recurring when it appears in more than one month; salary and client credits ignored as income.
