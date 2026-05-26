import re

file_path = '/home/rodrigo/development/prism-client/src/utils/tableColumns.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace align: "right" with align: "right" as const
content_fixed = re.sub(r'align:\s*"right"\s*,', 'align: "right" as const,', content)
content_fixed = re.sub(r'align:\s*"left"\s*,', 'align: "left" as const,', content_fixed)
content_fixed = re.sub(r'align:\s*"center"\s*,', 'align: "center" as const,', content_fixed)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content_fixed)

print("Successfully replaced all align properties with const assertions in tableColumns.tsx.")
