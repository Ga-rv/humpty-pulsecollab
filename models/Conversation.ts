import mongoose, { Document, Model, Schema, Types } from 'mongoose'

export interface IConversation extends Document {
  name?: string
  type: 'channel' | 'direct'
  members: Types.ObjectId[]
  projectContext?: string
  createdAt: Date
  updatedAt: Date
}

const ConversationSchema = new Schema<IConversation>(
  {
    name: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ['channel', 'direct'],
      default: 'channel',
      required: true,
    },
    members: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    projectContext: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
)

export const Conversation: Model<IConversation> =
  mongoose.models.Conversation ||
  mongoose.model<IConversation>('Conversation', ConversationSchema)

export default Conversation
