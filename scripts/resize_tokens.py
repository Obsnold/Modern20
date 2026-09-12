import os
import json

# Change this to your main folder path. '.' means the folder where this script is saved.
TARGET_DIRECTORY = '.'

def update_token_json_recursive(directory):
    # os.walk automatically goes deep into all subdirectories
    for root, dirs, files in os.walk(directory):
        for filename in files:
            if filename.endswith('.json'):
                file_path = os.path.join(root, filename)
                
                try:
                    # 1. Load the JSON data
                    with open(file_path, 'r', encoding='utf-8') as file:
                        data = json.load(file)
                    
                    # 2. Recursively find and update the texture block
                    def insert_texture_settings(obj):
                        if isinstance(obj, dict):
                            if 'texture' in obj and isinstance(obj['texture'], dict):
                                obj['texture'].update({
                                    "scaleX": 2,
                                    "scaleY": 2,
                                    "anchorX": 0.5,
                                    "anchorY": 0.25
                                })
                            for key, value in obj.items():
                                insert_texture_settings(value)
                        elif isinstance(obj, list):
                            for item in obj:
                                insert_texture_settings(item)

                    insert_texture_settings(data)
                    
                    # 3. Save the modified JSON back
                    with open(file_path, 'w', encoding='utf-8') as file:
                        json.dump(data, file, indent=2)
                    
                    # Prints the relative path so you can see which folders are changing
                    print(f"Updated: {os.path.relpath(file_path, directory)}")
                    
                except json.JSONDecodeError:
                    print(f"Skipped (Invalid JSON): {os.path.relpath(file_path, directory)}")
                except Exception as e:
                    print(f"Error processing {os.path.relpath(file_path, directory)}: {e}")

if __name__ == '__main__':
    # Highly recommended: Copy your main folder as a backup before running!
    update_token_json_recursive(TARGET_DIRECTORY)
