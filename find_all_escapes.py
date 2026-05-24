import os
import re

src_dir = "/home/rodrigo/development/prism-client/src"
output_file = "/home/rodrigo/development/prism-client/escapes_detailed_report.txt"

any_pat = re.compile(r"\bany\b")
record_pat = re.compile(r"Record\s*<\s*string\s*,\s*(any|unknown)\s*>")
eslint_any_pat = re.compile(r"eslint-disable-line|eslint-disable-next-line|eslint-disable")

results = []

for root, dirs, files in os.walk(src_dir):
    for file in files:
        if file.endswith((".ts", ".tsx")):
            path = os.path.join(root, file)
            rel_path = os.path.relpath(path, src_dir)
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                lines = f.readlines()
            
            file_any = 0
            file_record = 0
            file_eslint = 0
            
            file_details = []
            
            for idx, line in enumerate(lines):
                line_num = idx + 1
                
                # Check for Record<string, any/unknown>
                records = record_pat.findall(line)
                if records:
                    file_record += len(records)
                    file_details.append((line_num, "RECORD", line.strip()))
                    continue
                
                # Check for eslint disable next line or line
                if "eslint-disable" in line or "eslint-disable-next-line" in line or "eslint-disable-line" in line:
                    file_eslint += 1
                    file_details.append((line_num, "ESLINT", line.strip()))
                    continue
                
                # Check for \bany\b, but exclude comments unless they are eslint disable
                # Also exclude common words like "company", "many", "Germany", etc. (handled by \bany\b)
                # But let's check if it's in a comment. If it's a double slash comment or a block comment, we can skip it, except if it is code or special.
                # Actually, let's keep it simple: if \bany\b is in the line, check if it looks like type or code.
                anys = any_pat.findall(line)
                if anys:
                    # Basic comment check:
                    comment_idx = line.find("//")
                    if comment_idx != -1:
                        # If \bany\b is after //, skip it unless it's an eslint directive
                        line_code = line[:comment_idx]
                        if not any_pat.search(line_code):
                            continue
                    
                    file_any += len(anys)
                    file_details.append((line_num, "ANY", line.strip()))
            
            if file_any > 0 or file_record > 0 or file_eslint > 0:
                results.append({
                    "file": rel_path,
                    "any": file_any,
                    "record": file_record,
                    "eslint": file_eslint,
                    "details": file_details
                })

# Sort by number of total escapes descending
results.sort(key=lambda x: (x["any"] + x["record"] + x["eslint"]), reverse=True)

with open(output_file, "w", encoding="utf-8") as out:
    out.write("DETAILED ESCAPES REPORT\n")
    out.write("=======================\n\n")
    
    total_any = 0
    total_record = 0
    total_eslint = 0
    
    for r in results:
        total_any += r["any"]
        total_record += r["record"]
        total_eslint += r["eslint"]
        
    out.write(f"SUMMARY:\n")
    out.write(f"Total 'any' counts: {total_any}\n")
    out.write(f"Total 'Record' counts: {total_record}\n")
    out.write(f"Total 'eslint' overrides: {total_eslint}\n")
    out.write(f"Total overall: {total_any + total_record + total_eslint}\n\n")
    
    for r in results:
        tot = r["any"] + r["record"] + r["eslint"]
        out.write(f"File: {r['file']} (any={r['any']}, Record={r['record']}, eslint={r['eslint']} | Total={tot})\n")
        out.write("-" * 80 + "\n")
        for line_num, typ, content in r["details"]:
            out.write(f"  [{typ}] Line {line_num}: {content}\n")
        out.write("\n")

print(f"Report written to {output_file}")
print(f"Total overall escapes found: {total_any + total_record + total_eslint}")
