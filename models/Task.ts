import mongoose, { Document, Model, Schema } from 'mongoose'

export interface ITask extends Document {
  conversationId: string
  title: string
  assignee: string
  deadline: string
  status: 'pending' | 'completed'
  createdAt: Date
  updatedAt: Date
}

const TaskSchema = new Schema<ITask>(
  {
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    assignee: {
      type: String,
      default: 'Unassigned',
      trim: true,
    },
    deadline: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'completed'],
      default: 'pending',
    },
  },
  {
    timestamps: true,
  }
)

export const Task: Model<ITask> =
  mongoose.models.Task || mongoose.model<ITask>('Task', TaskSchema)

export default Task
