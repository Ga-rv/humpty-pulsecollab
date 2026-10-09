import mongoose, { Document, Model, Schema } from 'mongoose'

export interface ITask extends Document {
  /** Owner of the task. Tasks are private to this user and follow them across rooms/DMs/devices. */
  userId: string
  /** Room / DM where the task was created (informational only). */
  conversationId: string
  /** Stable id of the deadline / action item it came from, used to stop duplicates. */
  sourceKey?: string
  title: string
  assignee: string
  deadline: string
  status: 'pending' | 'completed'
  completedAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

const TaskSchema = new Schema<ITask>(
  {
    userId: {
      type: String,
      index: true,
    },
    conversationId: {
      type: String,
      required: true,
      index: true,
    },
    sourceKey: {
      type: String,
      default: '',
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
    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
)

TaskSchema.index({ userId: 1, sourceKey: 1 })

export const Task: Model<ITask> =
  mongoose.models.Task || mongoose.model<ITask>('Task', TaskSchema)

export default Task
