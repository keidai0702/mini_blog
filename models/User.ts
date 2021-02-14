import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm'

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryColumn({ type: 'uuid' })
  public id!: string

  @Column({ type: 'varchar' })
  public encryptedEmail!: string

  @Column({ type: 'varchar' })
  public salt!: string

  @Column({ type: 'varchar' })
  public passwordHash!: string

  @CreateDateColumn({ name:'created_at', type: 'timestamp' })
  public createdAt!: Date

	constructor(props: Partial<UserEntity>) {
    if (props) {
      if (props.encryptedEmail) {
        this.encryptedEmail = props.encryptedEmail;
      }
      if (props.salt) {
        this.salt = props.salt;
      }
      if (props.passwordHash) {
        this.passwordHash = props.passwordHash;
      }
    }
  }
}
