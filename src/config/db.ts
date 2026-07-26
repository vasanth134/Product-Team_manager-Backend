import mongoose from 'mongoose';

export const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/aether';
    mongoose.set('strictQuery', true);
    await mongoose.connect(mongoURI);
    console.log('MongoDB connected successfully to:', mongoURI.replace(/:[^@]+@/, ':****@')); // Hide credentials in log
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  }
};
