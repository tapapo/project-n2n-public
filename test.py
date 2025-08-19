
import cv2
print("cv2 =", cv2.__file__)
print("nonfree =", "YES" in cv2.getBuildInformation())
print("has SURF =", hasattr(cv2, "xfeatures2d") and hasattr(cv2.xfeatures2d, "SURF_create"))

