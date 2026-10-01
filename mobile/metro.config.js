// 앱 폴더 밖(저장소 루트)의 공통 로직 lib/·src/를 함께 쓰기 위한 Metro 설정
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const root = path.resolve(__dirname, "..");
config.watchFolders = [path.join(root, "lib"), path.join(root, "src")];

module.exports = config;
