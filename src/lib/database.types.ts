
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "lesson_blocks": {
                  Row: {
                    "block_type": string,"created_at": string,"id": string,"lesson_id": string,"notes": string | null,"score": number | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "block_type": string,"created_at"?: string,"id"?: string,"lesson_id": string,"notes"?: string | null,"score"?: number | null,"user_id": string
                  }
                  Update: {
                    "block_type"?: string,"created_at"?: string,"id"?: string,"lesson_id"?: string,"notes"?: string | null,"score"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lesson_blocks_owner_lesson_fk"
      columns: ["user_id","lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["user_id","id"]
    },{
      foreignKeyName: "lesson_blocks_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"lesson_exercises": {
                  Row: {
                    "block_id": string,"corrected_answer": string | null,"created_at": string,"explanation": string | null,"id": string,"my_answer": string | null,"prompt": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "block_id": string,"corrected_answer"?: string | null,"created_at"?: string,"explanation"?: string | null,"id"?: string,"my_answer"?: string | null,"prompt": string,"user_id": string
                  }
                  Update: {
                    "block_id"?: string,"corrected_answer"?: string | null,"created_at"?: string,"explanation"?: string | null,"id"?: string,"my_answer"?: string | null,"prompt"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lesson_exercises_owner_block_fk"
      columns: ["user_id","block_id"]
isOneToOne: false
      referencedRelation: "lesson_blocks"
      referencedColumns: ["user_id","id"]
    },{
      foreignKeyName: "lesson_exercises_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"lessons": {
                  Row: {
                    "created_at": string,"difficulties": string | null,"id": string,"lesson_number": number,"level": string | null,"recommendations": string | null,"report": string | null,"source_key": string | null,"status": string,"studied_on": string | null,"title": string | null,"topics": (string)[],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"difficulties"?: string | null,"id"?: string,"lesson_number": number,"level"?: string | null,"recommendations"?: string | null,"report"?: string | null,"source_key"?: string | null,"status"?: string,"studied_on"?: string | null,"title"?: string | null,"topics"?: (string)[],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"difficulties"?: string | null,"id"?: string,"lesson_number"?: number,"level"?: string | null,"recommendations"?: string | null,"report"?: string | null,"source_key"?: string | null,"status"?: string,"studied_on"?: string | null,"title"?: string | null,"topics"?: (string)[],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lessons_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"music_activities": {
                  Row: {
                    "activity_type": string,"corrections": string | null,"created_at": string,"difficulties": string | null,"explanations": string | null,"id": string,"music_study_id": string,"my_answers": string | null,"notes": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_type": string,"corrections"?: string | null,"created_at"?: string,"difficulties"?: string | null,"explanations"?: string | null,"id"?: string,"music_study_id": string,"my_answers"?: string | null,"notes"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "activity_type"?: string,"corrections"?: string | null,"created_at"?: string,"difficulties"?: string | null,"explanations"?: string | null,"id"?: string,"music_study_id"?: string,"my_answers"?: string | null,"notes"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "music_activities_owner_study_fk"
      columns: ["user_id","music_study_id"]
isOneToOne: false
      referencedRelation: "music_studies"
      referencedColumns: ["user_id","id"]
    },{
      foreignKeyName: "music_activities_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"music_studies": {
                  Row: {
                    "artist": string,"created_at": string,"difficulties": (string)[],"final_comprehension": string | null,"final_score": number | null,"id": string,"initial_comprehension": string | null,"initial_score": number | null,"level": string | null,"report": string | null,"song": string,"source_key": string | null,"status": string,"studied_on": string | null,"study_number": number | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "artist": string,"created_at"?: string,"difficulties"?: (string)[],"final_comprehension"?: string | null,"final_score"?: number | null,"id"?: string,"initial_comprehension"?: string | null,"initial_score"?: number | null,"level"?: string | null,"report"?: string | null,"song": string,"source_key"?: string | null,"status"?: string,"studied_on"?: string | null,"study_number"?: number | null,"user_id": string
                  }
                  Update: {
                    "artist"?: string,"created_at"?: string,"difficulties"?: (string)[],"final_comprehension"?: string | null,"final_score"?: number | null,"id"?: string,"initial_comprehension"?: string | null,"initial_score"?: number | null,"level"?: string | null,"report"?: string | null,"song"?: string,"source_key"?: string | null,"status"?: string,"studied_on"?: string | null,"study_number"?: number | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "music_studies_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"music_words": {
                  Row: {
                    "created_at": string,"excerpt": string | null,"id": string,"meaning": string | null,"music_study_id": string,"term": string,"user_id": string,"vocabulary_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"excerpt"?: string | null,"id"?: string,"meaning"?: string | null,"music_study_id": string,"term": string,"user_id": string,"vocabulary_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"excerpt"?: string | null,"id"?: string,"meaning"?: string | null,"music_study_id"?: string,"term"?: string,"user_id"?: string,"vocabulary_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "music_words_owner_study_fk"
      columns: ["user_id","music_study_id"]
isOneToOne: false
      referencedRelation: "music_studies"
      referencedColumns: ["user_id","id"]
    },{
      foreignKeyName: "music_words_owner_vocabulary_fk"
      columns: ["user_id","vocabulary_id"]
isOneToOne: false
      referencedRelation: "vocabulary"
      referencedColumns: ["user_id","id"]
    },{
      foreignKeyName: "music_words_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"current_level": string,"daily_goal_minutes": number,"display_name": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"current_level"?: string,"daily_goal_minutes"?: number,"display_name"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"current_level"?: string,"daily_goal_minutes"?: number,"display_name"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"skill_assessments": {
                  Row: {
                    "assessment_date": string,"created_at": string,"id": string,"lesson_id": string | null,"notes": string | null,"score": number | null,"score_max": number | null,"skill": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assessment_date": string,"created_at"?: string,"id"?: string,"lesson_id"?: string | null,"notes"?: string | null,"score"?: number | null,"score_max"?: number | null,"skill": string,"user_id": string
                  }
                  Update: {
                    "assessment_date"?: string,"created_at"?: string,"id"?: string,"lesson_id"?: string | null,"notes"?: string | null,"score"?: number | null,"score_max"?: number | null,"skill"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assessments_owner_lesson_fk"
      columns: ["user_id","lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["user_id","id"]
    },{
      foreignKeyName: "skill_assessments_lesson_id_fkey"
      columns: ["lesson_id"]
isOneToOne: false
      referencedRelation: "lessons"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "skill_assessments_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"study_activities": {
                  Row: {
                    "created_at": string,"description": string | null,"generator_key": string | null,"id": string,"plan_id": string,"planned_minutes": number,"position": number,"skill": string,"study_day": string,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"generator_key"?: string | null,"id"?: string,"plan_id": string,"planned_minutes": number,"position"?: number,"skill": string,"study_day": string,"title": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"generator_key"?: string | null,"id"?: string,"plan_id"?: string,"planned_minutes"?: number,"position"?: number,"skill"?: string,"study_day"?: string,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "activities_owner_plan_fk"
      columns: ["user_id","plan_id"]
isOneToOne: false
      referencedRelation: "study_plans"
      referencedColumns: ["user_id","id"]
    },{
      foreignKeyName: "study_activities_plan_id_fkey"
      columns: ["plan_id"]
isOneToOne: false
      referencedRelation: "study_plans"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "study_activities_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"study_plans": {
                  Row: {
                    "created_at": string,"id": string,"title": string,"user_id": string,"week_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"title": string,"user_id": string,"week_start": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"title"?: string,"user_id"?: string,"week_start"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "study_plans_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"study_sessions": {
                  Row: {
                    "activity_id": string | null,"actual_minutes": number,"completed_at": string,"id": string,"is_completed": boolean,"notes": string | null,"reopened_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_id"?: string | null,"actual_minutes": number,"completed_at"?: string,"id"?: string,"is_completed"?: boolean,"notes"?: string | null,"reopened_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "activity_id"?: string | null,"actual_minutes"?: number,"completed_at"?: string,"id"?: string,"is_completed"?: boolean,"notes"?: string | null,"reopened_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sessions_owner_activity_fk"
      columns: ["user_id","activity_id"]
isOneToOne: false
      referencedRelation: "study_activities"
      referencedColumns: ["user_id","id"]
    },{
      foreignKeyName: "study_sessions_activity_id_fkey"
      columns: ["activity_id"]
isOneToOne: false
      referencedRelation: "study_activities"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "study_sessions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"study_subactivities": {
                  Row: {
                    "activity_id": string,"completed_at": string | null,"created_at": string,"description": string | null,"id": string,"is_completed": boolean,"planned_minutes": number,"position": number,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "activity_id": string,"completed_at"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"is_completed"?: boolean,"planned_minutes": number,"position": number,"title": string,"user_id": string
                  }
                  Update: {
                    "activity_id"?: string,"completed_at"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"is_completed"?: boolean,"planned_minutes"?: number,"position"?: number,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "study_subactivities_owner_activity_fk"
      columns: ["user_id","activity_id"]
isOneToOne: false
      referencedRelation: "study_activities"
      referencedColumns: ["user_id","id"]
    },{
      foreignKeyName: "study_subactivities_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"vocabulary": {
                  Row: {
                    "created_at": string,"example_1": string,"example_1_translation": string | null,"example_2": string,"example_2_translation": string | null,"id": string,"next_review_at": string | null,"notes": string | null,"part_of_speech": string | null,"review_count": number,"review_interval_days": number,"review_streak": number,"source_ref": string | null,"source_type": string | null,"translation": string,"user_id": string,"word": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"example_1": string,"example_1_translation"?: string | null,"example_2": string,"example_2_translation"?: string | null,"id"?: string,"next_review_at"?: string | null,"notes"?: string | null,"part_of_speech"?: string | null,"review_count"?: number,"review_interval_days"?: number,"review_streak"?: number,"source_ref"?: string | null,"source_type"?: string | null,"translation": string,"user_id": string,"word": string
                  }
                  Update: {
                    "created_at"?: string,"example_1"?: string,"example_1_translation"?: string | null,"example_2"?: string,"example_2_translation"?: string | null,"id"?: string,"next_review_at"?: string | null,"notes"?: string | null,"part_of_speech"?: string | null,"review_count"?: number,"review_interval_days"?: number,"review_streak"?: number,"source_ref"?: string | null,"source_type"?: string | null,"translation"?: string,"user_id"?: string,"word"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "vocabulary_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    }
                  ]
                },"vocabulary_reviews": {
                  Row: {
                    "id": string,"interval_minutes": number | null,"next_review_at": string | null,"rating": string,"request_id": string | null,"reviewed_at": string,"streak_after": number | null,"user_id": string,"vocabulary_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"interval_minutes"?: number | null,"next_review_at"?: string | null,"rating": string,"request_id"?: string | null,"reviewed_at"?: string,"streak_after"?: number | null,"user_id": string,"vocabulary_id": string
                  }
                  Update: {
                    "id"?: string,"interval_minutes"?: number | null,"next_review_at"?: string | null,"rating"?: string,"request_id"?: string | null,"reviewed_at"?: string,"streak_after"?: number | null,"user_id"?: string,"vocabulary_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reviews_owner_word_fk"
      columns: ["user_id","vocabulary_id"]
isOneToOne: false
      referencedRelation: "vocabulary"
      referencedColumns: ["user_id","id"]
    },{
      foreignKeyName: "vocabulary_reviews_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["user_id"]
    },{
      foreignKeyName: "vocabulary_reviews_vocabulary_id_fkey"
      columns: ["vocabulary_id"]
isOneToOne: false
      referencedRelation: "vocabulary"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "complete_activity":
{ Args: { "p_activity_id": string,"p_actual_minutes": number }; Returns: {
              "activity_id": string | null,
"actual_minutes": number,
"completed_at": string,
"id": string,
"is_completed": boolean,
"notes": string | null,
"reopened_at": string | null,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "study_sessions"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_initial_plan":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,
"id": string,
"title": string,
"user_id": string,
"week_start": string
            }
                          SetofOptions: {
        from: "*"
        to: "study_plans"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_my_profile":
{ Args: Record<PropertyKey, never>; Returns: {
              "created_at": string,
"current_level": string,
"daily_goal_minutes": number,
"display_name": string | null,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "profiles"
        isOneToOne: true
        isSetofReturn: false
      } },
"generate_schedule":
{ Args: { "p_items": Json }; Returns: Json
                           },
"get_review_queue":
{ Args: { "p_limit"?: number }; Returns: {
              "created_at": string,
"example_1": string,
"example_1_translation": string | null,
"example_2": string,
"example_2_translation": string | null,
"id": string,
"next_review_at": string | null,
"notes": string | null,
"part_of_speech": string | null,
"review_count": number,
"review_interval_days": number,
"review_streak": number,
"source_ref": string | null,
"source_type": string | null,
"translation": string,
"user_id": string,
"word": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "vocabulary"
        isOneToOne: false
        isSetofReturn: true
      } },
"get_vocabulary_summary":
{ Args: Record<PropertyKey, never>; Returns: {
              "due": number,"new_words": number,"server_now": string,"total": number
            }[]
                           },
"get_week_summary":
{ Args: { "p_week_start": string }; Returns: {
              "completed_count": number,"completed_minutes": number,"has_plan": boolean,"planned_count": number,"planned_minutes": number
            }[]
                           },
"list_vocabulary":
{ Args: { "p_filter"?: string,"p_limit"?: number,"p_offset"?: number,"p_search"?: string }; Returns: {
              "created_at": string,"example_1": string,"example_2": string,"id": string,"next_review_at": string,"notes": string,"part_of_speech": string,"review_count": number,"source_ref": string,"source_type": string,"total_count": number,"translation": string,"word": string
            }[]
                           },
"reopen_activity":
{ Args: { "p_activity_id": string }; Returns: {
              "activity_id": string | null,
"actual_minutes": number,
"completed_at": string,
"id": string,
"is_completed": boolean,
"notes": string | null,
"reopened_at": string | null,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "study_sessions"
        isOneToOne: true
        isSetofReturn: false
      } },
"reorder_day_activities":
{ Args: { "p_ids": (string)[],"p_plan_id": string,"p_study_day": string }; Returns: undefined
                           },
"review_vocabulary":
{ Args: { "p_rating": string,"p_request_id": string,"p_vocabulary_id": string }; Returns: {
              "id": string,
"interval_minutes": number | null,
"next_review_at": string | null,
"rating": string,
"request_id": string | null,
"reviewed_at": string,
"streak_after": number | null,
"user_id": string,
"vocabulary_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "vocabulary_reviews"
        isOneToOne: true
        isSetofReturn: false
      } },
"save_activity":
{ Args: { "p_activity_id": string,"p_description": string,"p_plan_id": string,"p_planned_minutes": number,"p_skill": string,"p_steps"?: Json,"p_study_day": string,"p_title": string }; Returns: {
              "created_at": string,
"description": string | null,
"generator_key": string | null,
"id": string,
"plan_id": string,
"planned_minutes": number,
"position": number,
"skill": string,
"study_day": string,
"title": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "study_activities"
        isOneToOne: true
        isSetofReturn: false
      } },
"schedule_write_steps":
{ Args: { "p_activity_id": string,"p_steps": Json }; Returns: number
                           },
"set_subactivity_completed":
{ Args: { "p_actual_minutes"?: number,"p_completed": boolean,"p_subactivity_id": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
