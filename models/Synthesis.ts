import mongoose, { Document, Model, Schema } from 'mongoose'

export interface ISynthesis extends Document {
  conversationId: string
  deadlines: any[]
  actionItems: any[]
  summary: string
  createdAt: Date
  updatedAt: Date
}

const SynthesisSchema = new Schema<ISynthesis>(
  {
    conversationId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    deadlines: {
      type: [Schema.Types.Mixed] as any,
      default: [],
    },
    actionItems: {
      type: [Schema.Types.Mixed] as any,
      default: [],
    },
    summary: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
)

export const Synthesis: Model<ISynthesis> =
  mongoose.models.Synthesis || mongoose.model<ISynthesis>('Synthesis', SynthesisSchema)

export default Synthesis
