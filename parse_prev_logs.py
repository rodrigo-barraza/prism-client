import json

log_path = "/home/rodrigo/.gemini/antigravity-ide/brain/f54bd83d-c9d9-48de-9f98-2deafd41586a/.system_generated/logs/transcript.jsonl"

with open(log_path, "r") as f:
    for line in f:
        try:
            data = json.loads(line)
            if "tool_calls" in data:
                for tc in data["tool_calls"]:
                    name = tc.get("name")
                    args = tc.get("args", {})
                    # Print interesting details
                    if name == "default_api:run_command":
                        print(f"Run command: {args.get('CommandLine')}")
                    elif name in ("default_api:replace_file_content", "default_api:multi_replace_file_content"):
                        print(f"File edit: {args.get('TargetFile')}")
                    elif name == "default_api:write_to_file":
                        print(f"Write file: {args.get('TargetFile')}")
        except Exception as e:
            pass
