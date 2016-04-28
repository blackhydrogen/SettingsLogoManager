# SettingsLogoManager

## Installation
1. Install node.js v4.2.1 and above. https://nodejs.org/en/
2. Clone this repository
3. In command prompt/shell, cd to this repository's root folder.
4. Run `npm install` (or possibly `sudo npm install`) to download and "install" the dependencies for this repository.

## Running
1. Run `node .` in root folder to start the problem.

## Video annotations
In order for video annotations to work, you are required to run `outputAnnotationVideo.bat`.
Note the current file uses ffmpeg to read from a folder of images, encode to AVI before sending it to VLC
(where VLC acts as a server).

Modify the input source as needed.

Obviously you will need ffmpeg and VLC installed.

