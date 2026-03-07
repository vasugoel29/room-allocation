import json
import os

input_file = "rooms_complete_data.json"
output_file = "rooms_complete_data_updated.json"

# Rooms to remove (Labs)
labs_to_remove = ["5025", "5012", "5101", "5115", "5129", "5133", "5201", "5218", "5309", "5129", "5133"]

# Metadata updates
ac_proj_rooms = ["5015", "5116", "5119", "5215", "5216", "5217", "5221", "5222", "5311", "5312", "5305", "5306", "5307"]
small_rooms = ["5220", "5310", "5308"]
no_ac_no_proj = ["5027", "5028", "5024", "5013", "5014", "5017", "5127", "5138", "5219", "5301"]

def process_rooms():
    if not os.path.exists(input_file):
        print(f"Error: {input_file} not found.")
        return

    with open(input_file, 'r') as f:
        data = json.load(f)

    original_rooms = data.get("rooms", [])
    updated_rooms = []

    for room_data in original_rooms:
        room_number = room_data.get("room")
        
        # Skip labs
        if room_number in labs_to_remove:
            print(f"Removing lab: {room_number}")
            continue
            
        # Update metadata
        metadata = room_data.get("metadata", {})
        
        if room_number in ac_proj_rooms:
            metadata["has_ac"] = True
            metadata["has_projector"] = True
        elif room_number in small_rooms:
            metadata["has_ac"] = False
            metadata["has_projector"] = False
            metadata["size"] = "small"
        elif room_number in no_ac_no_proj:
            metadata["has_ac"] = False
            metadata["has_projector"] = False
            
        room_data["metadata"] = metadata
        updated_rooms.append(room_data)

    # Update data structure
    data["rooms"] = updated_rooms
    data["total_rooms"] = len(updated_rooms)
    
    # Update analysis summary if present
    if "analysis" in data:
        data["analysis"]["total_rooms"] = len(updated_rooms)
        # We might want to remove filtered rooms from analysis as well, 
        # but the prompt specifically says "remove data in this file which corresponds to labs"
        if "most_available_rooms" in data["analysis"]:
            data["analysis"]["most_available_rooms"] = [r for r in data["analysis"]["most_available_rooms"] if r["room"] not in labs_to_remove]
        if "least_available_rooms" in data["analysis"]:
            data["analysis"]["least_available_rooms"] = [r for r in data["analysis"]["least_available_rooms"] if r["room"] not in labs_to_remove]

    with open(output_file, 'w') as f:
        json.dump(data, f, indent=2)

    print(f"Successfully processed rooms. New count: {len(updated_rooms)}")
    print(f"Updated file saved to: {output_file}")

if __name__ == "__main__":
    process_rooms()
