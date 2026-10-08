import mongoose, { Document, Model, Schema, Types } from 'mongoose'

export interface IDirectMessage extends Document {
  senderId: Types.ObjectId | string
  recipientId: Types.ObjectId | string
  text: string
  createdAt: Date
}

const DirectMessageSchema = new Schema<IDirectMessage>(
  {
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
)

DirectMessageSchema.index({ senderId: 1, recipientId: 1, createdAt: 1 })
DirectMessageSchema.index({ recipientId: 1, senderId: 1, createdAt: 1 })

export const DirectMessage: Model<IDirectMessage> =
  mongoose.models.DirectMessage ||
  mongoose.model<IDirectMessage>('DirectMessage', DirectMessageSchema)

export default DirectMessage
