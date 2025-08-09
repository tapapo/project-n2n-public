import cv2
import os
import sys

def convert_to_grayscale(input_image_path, output_directory="grayscale_images"):
   
    print(f"--- Converting {os.path.basename(input_image_path)} to Grayscale ---")

    if not os.path.exists(input_image_path):
        print(f"[ERROR] Input file not found: {input_image_path}")
        return


    img_color = cv2.imread(input_image_path)

    if img_color is None:
        print(f"[ERROR] Could not load image from {input_image_path}. It might be corrupted or an unsupported format.")
        return

    if len(img_color.shape) == 2:
        print(f"[INFO] Image is already grayscale. No conversion needed.")
        gray_img = img_color
    else:
    
        gray_img = cv2.cvtColor(img_color, cv2.COLOR_BGR2GRAY)
        print(f"[INFO] Successfully converted image to grayscale.")

    os.makedirs(output_directory, exist_ok=True)

    base_name = os.path.splitext(os.path.basename(input_image_path))[0]
    output_image_path = os.path.join(output_directory, f"{base_name}_grayscale.jpg") 

    try:
        cv2.imwrite(output_image_path, gray_img)
        print(f"[INFO] Grayscale image saved to: {output_image_path}")
    except Exception as e:
        print(f"[ERROR] Failed to save grayscale image: {e}")

if __name__ == "__main__":

    current_script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(current_script_dir) 
    input_image_to_convert = os.path.join(project_root, 'image', 'BallA.jpg') 

    convert_to_grayscale(input_image_to_convert)
    print("\nGrayscale conversion process finished.")



# --- Example Usage ---
if __name__ == "__main__":
    
    current_script_dir = os.path.dirname(os.path.abspath(__file__)) 
    image_descriptor_dir = os.path.join(current_script_dir, 'Image-to-Descriptor')
    image_folder_path = os.path.join(image_descriptor_dir, 'image') 
    input_image_name_1 = 'BallA.jpg'
    input_image_to_convert_1 = os.path.join(image_folder_path, input_image_name_1)
    convert_to_grayscale(input_image_to_convert_1)

    print("\nGrayscale conversion process finished.")