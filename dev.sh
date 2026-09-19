#!/bin/bash
# KangarooPost — start both backend and frontend

echo "🚀 Starting KangarooPost..."

# Install backend deps if needed
if [ ! -d "backend/node_modules" ]; then
  echo "📦 Installing backend dependencies..."
  cd backend && npm install && cd ..
fi

# Install frontend deps if needed
if [ ! -d "frontend/node_modules" ]; then
  echo "📦 Installing frontend dependencies..."
  cd frontend && npm install && cd ..
fi

# Install local Postgres helper deps if needed, then start the database
if [ ! -d "db/node_modules" ]; then
  echo "📦 Installing local PostgreSQL..."
  (cd db && npm install)
fi
echo "🐘 Starting PostgreSQL on port 5432..."
(cd db && npm start > pg.log 2>&1) &
DB_PID=$!
sleep 6

# Start backend in background
echo "🔧 Starting backend on port 4000..."
cd backend && npm start &
BACKEND_PID=$!

sleep 2

# Start frontend
echo "🌐 Starting frontend on port 3000..."
cd ../frontend && npm run dev

# Cleanup on exit
kill $BACKEND_PID $DB_PID 2>/dev/null
