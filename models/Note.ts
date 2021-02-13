import { Entity, Column, PrimaryColumn, CreateDateColumn } from 'typeorm'

@Entity({ name: 'notes' })
export class NoteEntity {
  @PrimaryColumn({ type: 'uuid' })
  public id!: string

  @Column({ type: 'varchar', length: 255 })
  public title!: string

  @Column({ type: 'text' })
  public body!: string

  @CreateDateColumn({ name:'created_at', type: 'timestamp' })
  public createdAt!: Date
}
