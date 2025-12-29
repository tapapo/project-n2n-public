# n2n-image-processing

# run frontend
npm run dev

# run server 
uvicorn server.main:app --reload 

# run pytest
pytest -v project_n2n

# OpenCV SURF & BRISQUE Setup for Project n2n
1. การเตรียมซอร์สโค้ด (Source Preparation)
ดาวน์โหลด OpenCV และโมดูลเสริม (Contrib) ไว้ที่หน้า Desktop:

OpenCV Main: opencv

OpenCV Contrib: opencv_contrib (จำเป็นสำหรับการใช้ SURF)

2. การกำหนดค่าการสร้าง (CMake Configuration)
ใช้คำสั่ง cmake เพื่อสร้าง Makefile โดยมีการปรับแต่งพิเศษเพื่อข้ามบั๊กบน macOS 15 และ Apple Silicon:
cmake -D CMAKE_BUILD_TYPE=RELEASE \
-D CMAKE_INSTALL_PREFIX=/usr/local \
-D OPENCV_ENABLE_NONFREE=ON \
-D OPENCV_EXTRA_MODULES_PATH=../opencv_contrib/modules \
-D PYTHON3_EXECUTABLE=$(which python) \
-D PYTHON3_LIBRARY=/Library/Frameworks/Python.framework/Versions/3.11/lib/libpython3.11.dylib \
-D PYTHON3_INCLUDE_DIR=/Library/Frameworks/Python.framework/Versions/3.11/include/python3.11 \
-D PYTHON3_PACKAGES_PATH=$(python -c "import site; print(site.getsitepackages()[0])") \
-D BUILD_opencv_python3=ON \
-D BUILD_opencv_videoio=OFF \
-D BUILD_opencv_gapi=OFF \
-D BUILD_opencv_sfm=OFF \
-D BUILD_opencv_typing_stubs=OFF \
-D WITH_GSTREAMER=OFF \
-D WITH_FFMPEG=OFF \
../opencv

3. การสร้างและติดตั้ง (Build & Install)
รันคำสั่งเพื่อ Compile ซอร์สโค้ดและยัดไฟล์เข้าไปในระบบ:
sudo make -j8        
sudo make install  

4. การทำทางลัด Library (Symbolic Link)
เพื่อให้ Python ใน venv มองเห็น OpenCV ที่สร้างขึ้นใหม่:
cd .venv/lib/python3.11/site-packages
ln -sf cv2/python-3.11/cv2.cpython-311-darwin.so cv2.so

5. การติดตั้ง BRISQUE (Image Quality Check)
ติดตั้งโมดูลวัดคุณภาพภาพโดย ห้ามรัน pip install opencv-python ทับเด็ดขาด:
sudo chown -R $(whoami) .venv  # คืนสิทธิ์ไฟล์ให้ User
pip install libsvm-official
pip install brisque --no-deps  # ติดตั้งโดยไม่ให้ลาก OpenCV ตัวอื่นมาทับ
pip install requests urllib3 charset_normalizer 

6. การตรวจสอบผลลัพธ์ (Verification)
รันคำสั่งนี้เพื่อยืนยันว่าทุกอย่างพร้อมใช้งาน:
python -c "import cv2; print('✅ Version:', cv2.__version__); print('✅ SURF Ready:', hasattr(cv2.xfeatures2d, 'SURF_create'))"
python -c "import brisque; print('✅ BRISQUE Ready')"