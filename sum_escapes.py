import re

with open("/home/rodrigo/development/prism-client/escapes_report.txt", "r") as f:
    lines = f.readlines()

total_any = 0
total_record = 0
total_eslint = 0

for line in lines:
    match = re.search(r"any=(\d+),\s*Record=(\d+),\s*eslint=(\d+)", line)
    if match:
        total_any += int(match.group(1))
        total_record += int(match.group(2))
        total_eslint += int(match.group(3))

print(f"Total 'any' counts: {total_any}")
print(f"Total 'Record' counts: {total_record}")
print(f"Total 'eslint' overrides: {total_eslint}")
