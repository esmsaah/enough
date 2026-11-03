# Merge a full-schema raw CSV (with header) into plans_verified.csv, replacing same service+country.
import csv, sys
f = open('plans_verified.csv'); rows = list(csv.DictReader(f)); f.close(); keys = list(rows[0].keys())
new = []
for r in csv.DictReader(open(sys.argv[1])):
    n = {k: '' for k in keys}; n.update({k: v for k, v in r.items() if k in keys})
    n['checked'] = n['checked'] or '2026-11-03'; new.append(n)
pairs = {(n['service'], n['country']) for n in new}
rows = [r for r in rows if (r['service'], r['country']) not in pairs] + new
with open('plans_verified.csv', 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=keys); w.writeheader(); w.writerows(rows)
print(len(new), 'merged,', len(rows), 'total')
