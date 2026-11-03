# Merge a raw CSV (service,country,plan,monthly,currency,streams,ads,url) into plans_verified.csv.
import csv, sys
raw, tier = sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'A official'
f = open('plans_verified.csv'); rows = list(csv.DictReader(f)); f.close(); keys = list(rows[0].keys())
new = []
for line in csv.reader(open(raw)):
    if not line or line[2] == 'NOT_VERIFIED': continue
    s, cc, plan, m, cur, streams, ads, url = (line + [''] * 8)[:8]
    new.append(dict(service=s, country=cc, plan=plan, monthly=m, yearly='', currency=cur, ads=ads, streams=(streams if s=='netflix' else ''), quality='', accounts=(streams if s!='netflix' else '1'), same_address='yes' if s=='netflix' or (s=='spotify' and ('Duo' in plan or 'Family' in plan)) else 'no', source=url, checked='2026-11-03', note='', tier=tier))
pairs = {(n['service'], n['country']) for n in new}
rows = [r for r in rows if (r['service'], r['country']) not in pairs] + new
with open('plans_verified.csv', 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=keys); w.writeheader(); w.writerows(rows)
print(len(new), 'merged,', len(rows), 'total')
