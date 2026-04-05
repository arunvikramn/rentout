@echo off
git init
git remote add origin https://github.com/arunvikramn/rentout
git add .
git commit -m "initial commit"
git branch -M main
git push -u origin main
pause